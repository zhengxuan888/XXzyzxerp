import type { Prisma } from "@prisma/client";

import { normalizeScope, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export type ShipmentAccessMembership = {
  id: string;
  userId: string;
  roleId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

export type ShipmentAccessTarget = {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  creatorUserId: string;
  ownerMembershipId: string;
};

type ScopeSource = {
  scope: PermissionScope;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  source: "role" | "access_grant";
};

type CompiledScopeSource = ScopeSource & {
  departmentIds: Set<string>;
  subordinateMembershipIds: Set<string>;
};

export type ShipmentAccessPlan = {
  /**
   * The plan is scoped to the active business context. A grant for another
   * business unit becomes effective only after the user explicitly switches
   * to an effective Membership for that context.
   */
  allowed: boolean;
  where: Prisma.ShipmentWhereInput;
  sourceCount: number;
  allows: (target: ShipmentAccessTarget) => boolean;
};

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
  rows: Array<{ id: string; userId: string; managerMembershipId: string | null }>,
  actorMembershipId: string,
) {
  const children = new Map<string, string[]>();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (!row.managerMembershipId) continue;
    children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), row.id]);
  }
  const membershipIds = new Set<string>();
  const seen = new Set<string>();
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    if (!row) continue;
    membershipIds.add(row.id);
    queue.push(...(children.get(id) ?? []));
  }
  return membershipIds;
}

function clauseFor(source: CompiledScopeSource, membership: ShipmentAccessMembership): Prisma.ShipmentWhereInput | null {
  const withinBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return withinBusinessUnit;
  if (source.scope === "DEPARTMENT") {
    return source.departmentId ? { ...withinBusinessUnit, order: { is: { departmentId: source.departmentId } } } : null;
  }
  if (source.scope === "DEPARTMENT_TREE") {
    const ids = [...source.departmentIds];
    return ids.length ? { ...withinBusinessUnit, order: { is: { departmentId: { in: ids } } } } : null;
  }
  if (source.scope === "SITE") {
    return source.siteId ? { ...withinBusinessUnit, siteId: source.siteId } : null;
  }
  if (source.scope === "SELF") {
    return { ...withinBusinessUnit, order: { is: { ownedByMembershipId: membership.id } } };
  }
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...withinBusinessUnit, order: { is: { ownedByMembershipId: { in: membershipIds } } } } : null;
  }
  return null;
}

function matchesSource(source: CompiledScopeSource, membership: ShipmentAccessMembership, target: ShipmentAccessTarget) {
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
 * Compiles one action's role permissions and active grants into a single
 * database predicate for shipment list queries. It is deliberately created
 * per request: permission revocation/expiry is observed on the next request
 * without relying on a stale cross-request cache.
 */
export async function createShipmentAccessPlan({
  membership,
  actionKey,
  now = new Date(),
}: {
  membership: ShipmentAccessMembership;
  actionKey: string;
  now?: Date;
}): Promise<ShipmentAccessPlan> {
  const [rolePermissions, grants] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { roleId: membership.roleId, actionKey, isAllowed: true },
      select: { scope: true, conditions: true },
    }),
    prisma.accessGrant.findMany({
      where: {
        granteeMembershipId: membership.id,
        actionKey,
        businessUnitId: membership.businessUnitId,
        isActive: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { scope: true, businessUnitId: true, departmentId: true, siteId: true },
    }),
  ]);

  const sources: ScopeSource[] = [
    ...rolePermissions.filter((permission) => permission.conditions == null).map((permission) => ({
      scope: normalizeScope(permission.scope),
      businessUnitId: membership.businessUnitId,
      departmentId: membership.departmentId,
      siteId: membership.siteId,
      source: "role" as const,
    })),
    ...grants.map((grant) => ({
      scope: normalizeScope(grant.scope),
      businessUnitId: grant.businessUnitId,
      departmentId: grant.departmentId,
      siteId: grant.siteId,
      source: "access_grant" as const,
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
        select: { id: true, userId: true, managerMembershipId: true },
      })
      : Promise.resolve([]),
  ]);
  const subordinateMembershipIds = needsSubordinates ? collectSubordinateMembershipIds(memberships, membership.id) : new Set<string>();
  const compiled = sources.map<CompiledScopeSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? collectDepartmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinateMembershipIds : new Set<string>(),
  }));
  const clauses = compiled.map((source) => clauseFor(source, membership)).filter((clause): clause is Prisma.ShipmentWhereInput => Boolean(clause));

  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    sourceCount: clauses.length,
    allows: (target) => compiled.some((source) => matchesSource(source, membership, target)),
  };
}
