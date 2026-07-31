import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkPermission, normalizeScope, type PermissionScope } from "@/lib/permission";

export type OrderReadScope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "SITE" | "SELF" | "NONE";

type MembershipLike = {
  id: string;
  userId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

type OrderAccessTarget = {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  ownerMembershipId: string;
};

type ScopeSource = {
  scope: PermissionScope;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

type CompiledScopeSource = ScopeSource & {
  departmentIds: Set<string>;
  subordinateMembershipIds: Set<string>;
};

export type OrderAccessPlan = {
  allowed: boolean;
  where: Prisma.OrderWhereInput;
  sourceCount: number;
  allows: (target: OrderAccessTarget) => boolean;
};

type ScopeRank = Record<OrderReadScope, number>;

const scopeRank: ScopeRank = {
  NONE: 0,
  SELF: 1,
  SITE: 2,
  DEPARTMENT: 2,
  BUSINESS_UNIT: 3,
  ALL: 4,
};

function pickHigherScope(scopeA: OrderReadScope, scopeB: OrderReadScope) {
  return scopeRank[scopeA] >= scopeRank[scopeB] ? scopeA : scopeB;
}

function activeMembershipWhere(now: Date) {
  return {
    isActive: true,
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
}

function collectDepartmentTree(
  rows: Array<{ id: string; parentId: string | null }>,
  rootId: string | null,
) {
  if (!rootId) return new Set<string>();
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  }
  const result = new Set<string>([rootId]);
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

function collectSubordinateMembershipIds(
  rows: Array<{ id: string; managerMembershipId: string | null }>,
  actorMembershipId: string,
) {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.managerMembershipId) continue;
    children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), row.id]);
  }
  const membershipIds = new Set<string>();
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || membershipIds.has(id)) continue;
    membershipIds.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return membershipIds;
}

function clauseFor(source: CompiledScopeSource, membership: MembershipLike): Prisma.OrderWhereInput | null {
  const withinBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return withinBusinessUnit;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...withinBusinessUnit, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const ids = [...source.departmentIds];
    return ids.length ? { ...withinBusinessUnit, departmentId: { in: ids } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...withinBusinessUnit, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...withinBusinessUnit, ownedByMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const ids = [...source.subordinateMembershipIds];
    return ids.length ? { ...withinBusinessUnit, ownedByMembershipId: { in: ids } } : null;
  }
  return null;
}

function matchesSource(source: CompiledScopeSource, membership: MembershipLike, target: OrderAccessTarget) {
  if (target.businessUnitId !== source.businessUnitId) return false;
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return true;
  if (source.scope === "DEPARTMENT") return Boolean(source.departmentId && target.departmentId === source.departmentId);
  if (source.scope === "DEPARTMENT_TREE") return Boolean(target.departmentId && source.departmentIds.has(target.departmentId));
  if (source.scope === "SITE") return Boolean(source.siteId && target.siteId === source.siteId);
  if (source.scope === "SELF") return target.ownerMembershipId === membership.id;
  if (source.scope === "SUBORDINATES") return source.subordinateMembershipIds.has(target.ownerMembershipId);
  return false;
}

/**
 * Compile the active Membership's role permissions and active grants into one
 * query predicate. This keeps lists, dashboards and direct-detail checks on
 * the same scope model, including department trees and reporting lines.
 */
export async function createOrderAccessPlan({
  membership,
  actionKey = "order.read",
  now = new Date(),
}: {
  membership: MembershipLike & { roleId: string };
  actionKey?: string;
  now?: Date;
}): Promise<OrderAccessPlan> {
  const [rolePermissions, grants] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { roleId: membership.roleId, actionKey, isAllowed: true },
      select: { scope: true, conditions: true },
    }),
    prisma.accessGrant.findMany({
      where: {
        granteeMembershipId: membership.id,
        actionKey,
        // Additional grants outside the selected business context are kept
        // dormant until the user explicitly switches context.
        businessUnitId: membership.businessUnitId,
        isActive: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { scope: true, businessUnitId: true, departmentId: true, siteId: true },
    }),
  ]);

  const sources: ScopeSource[] = [
    ...rolePermissions
      .filter((permission) => permission.conditions == null)
      .map((permission) => ({
        scope: normalizeScope(permission.scope),
        businessUnitId: membership.businessUnitId,
        departmentId: membership.departmentId,
        siteId: membership.siteId,
      })),
    ...grants.map((grant) => ({
      scope: normalizeScope(grant.scope),
      businessUnitId: grant.businessUnitId,
      departmentId: grant.departmentId,
      siteId: grant.siteId,
    })),
  ].filter((source) => source.scope !== "NONE");

  const needsDepartmentTree = sources.some((source) => source.scope === "DEPARTMENT_TREE");
  const needsSubordinates = sources.some((source) => source.scope === "SUBORDINATES");
  const [departments, memberships] = await Promise.all([
    needsDepartmentTree
      ? prisma.department.findMany({
          where: { businessUnitId: membership.businessUnitId, isActive: true },
          select: { id: true, parentId: true },
        })
      : Promise.resolve([]),
    needsSubordinates
      ? prisma.membership.findMany({
          where: { businessUnitId: membership.businessUnitId, ...activeMembershipWhere(now) },
          select: { id: true, managerMembershipId: true },
        })
      : Promise.resolve([]),
  ]);
  const subordinateMembershipIds = needsSubordinates
    ? collectSubordinateMembershipIds(memberships, membership.id)
    : new Set<string>();
  const compiled = sources.map<CompiledScopeSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? collectDepartmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinateMembershipIds : new Set<string>(),
  }));
  const clauses = compiled
    .map((source) => clauseFor(source, membership))
    .filter((clause): clause is Prisma.OrderWhereInput => Boolean(clause));

  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    sourceCount: clauses.length,
    allows: (target) => compiled.some((source) => matchesSource(source, membership, target)),
  };
}

export async function resolveOrderReadScope(membership: MembershipLike, userId: string): Promise<OrderReadScope> {
  const membershipCtx = {
    userId,
    membershipId: membership.id,
    targetBusinessUnitId: membership.businessUnitId,
  };

  const self = await checkPermission({
    ...membershipCtx,
    actionKey: "order.read",
    targetBusinessUnitId: membership.businessUnitId,
    targetUserId: membership.userId,
    targetMembershipId: membership.id,
  });
  const site = await checkPermission({
    ...membershipCtx,
    actionKey: "order.read",
    targetBusinessUnitId: membership.businessUnitId,
    targetSiteId: membership.siteId,
  });
  const department = await checkPermission({
    ...membershipCtx,
    actionKey: "order.read",
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: membership.departmentId,
  });
  const businessUnit = await checkPermission({
    ...membershipCtx,
    actionKey: "order.read",
    targetBusinessUnitId: membership.businessUnitId,
  });

  let scope: OrderReadScope = "NONE";
  if (businessUnit.allowed) {
    scope = pickHigherScope(scope, "BUSINESS_UNIT");
  }
  if (site.allowed && membership.siteId) {
    scope = pickHigherScope(scope, "SITE");
  }
  if (department.allowed && membership.departmentId) {
    scope = pickHigherScope(scope, "DEPARTMENT");
  }
  if (scope === "NONE" && self.allowed && membership.userId === userId) {
    scope = "SELF";
  }
  return scope;
}

export function withOrderReadScope(where: Record<string, unknown>, scope: OrderReadScope, membership: MembershipLike) {
  if (scope === "ALL" || scope === "BUSINESS_UNIT") return where;
  if (scope === "DEPARTMENT") {
    if (!membership.departmentId) return { AND: [where, { id: "00000000-0000-0000-0000-000000000000" }] } as Record<string, unknown>;
    return {
      AND: [where, { departmentId: membership.departmentId }],
    } as Record<string, unknown>;
  }
  if (scope === "SITE") {
    if (!membership.siteId) return { AND: [where, { id: "00000000-0000-0000-0000-000000000000" }] } as Record<string, unknown>;
    return { AND: [where, { siteId: membership.siteId }] } as Record<string, unknown>;
  }
  return {
    AND: [
      where,
      {
        // A user can have several Memberships in the same business unit.
        // SELF must follow the active Membership that owns the order, not a
        // shared account id that may also own another department's order.
        ownedByMembershipId: membership.id,
      },
    ],
  } as Record<string, unknown>;
}

export async function assertOrderReadScope({
  membership,
  orderId,
}: {
  membership: MembershipLike & { roleId: string };
  orderId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { businessUnitId: true, departmentId: true, siteId: true, creatorUserId: true, ownedByMembershipId: true },
  });
  if (!order || order.businessUnitId !== membership.businessUnitId) return false;

  const plan = await createOrderAccessPlan({ membership, actionKey: "order.read" });
  return plan.allows({
    businessUnitId: order.businessUnitId,
    departmentId: order.departmentId,
    siteId: order.siteId,
    ownerMembershipId: order.ownedByMembershipId,
  });
}
