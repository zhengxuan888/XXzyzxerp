import type { Prisma } from "@prisma/client";

import { normalizeScope, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type MembershipLike = {
  id: string;
  userId: string;
  roleId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

export type ResourceAccessTarget = {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  assignedMembershipId: string | null;
};

type ScopeSource = {
  scope: PermissionScope;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

type CompiledSource = ScopeSource & {
  departmentIds: Set<string>;
  subordinateMembershipIds: Set<string>;
};

export type ResourceAccessPlan = {
  allowed: boolean;
  where: Prisma.ResourceAssetWhereInput;
  allows: (target: ResourceAccessTarget) => boolean;
};

function activeMembershipWhere(now: Date) {
  return {
    isActive: true,
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
}

function collectDepartmentTree(rows: Array<{ id: string; parentId: string | null }>, rootId: string | null) {
  if (!rootId) return new Set<string>();
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
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

function collectSubordinates(rows: Array<{ id: string; managerMembershipId: string | null }>, actorMembershipId: string) {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (row.managerMembershipId) children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), row.id]);
  }
  const result = new Set<string>();
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

function clauseFor(source: CompiledSource, membership: MembershipLike): Prisma.ResourceAssetWhereInput | null {
  const inBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return inBusinessUnit;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...inBusinessUnit, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const ids = [...source.departmentIds];
    return ids.length ? { ...inBusinessUnit, departmentId: { in: ids } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...inBusinessUnit, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...inBusinessUnit, assignedMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const ids = [...source.subordinateMembershipIds];
    return ids.length ? { ...inBusinessUnit, assignedMembershipId: { in: ids } } : null;
  }
  return null;
}

function matches(source: CompiledSource, membership: MembershipLike, target: ResourceAccessTarget) {
  if (target.businessUnitId !== source.businessUnitId) return false;
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return true;
  if (source.scope === "DEPARTMENT") return Boolean(source.departmentId && target.departmentId === source.departmentId);
  if (source.scope === "DEPARTMENT_TREE") return Boolean(target.departmentId && source.departmentIds.has(target.departmentId));
  if (source.scope === "SITE") return Boolean(source.siteId && target.siteId === source.siteId);
  if (source.scope === "SELF") return target.assignedMembershipId === membership.id;
  if (source.scope === "SUBORDINATES") return Boolean(target.assignedMembershipId && source.subordinateMembershipIds.has(target.assignedMembershipId));
  return false;
}

/**
 * Compiles role permissions and active access grants into a single resource
 * predicate. A resource is owned by its current assignee for SELF and
 * SUBORDINATES scopes; department/site scopes use the resource's actual
 * organisation fields. This same plan is used by lists, direct details and
 * writes so a hidden button cannot become an API bypass.
 */
export async function createResourceAccessPlan({
  membership,
  actionKey = "resource.read",
  now = new Date(),
}: {
  membership: MembershipLike;
  actionKey?: string;
  now?: Date;
}): Promise<ResourceAccessPlan> {
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

  const subordinateMembershipIds = needsSubordinates ? collectSubordinates(memberships, membership.id) : new Set<string>();
  const compiled = sources.map<CompiledSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? collectDepartmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinateMembershipIds : new Set<string>(),
  }));
  const clauses = compiled
    .map((source) => clauseFor(source, membership))
    .filter((clause): clause is Prisma.ResourceAssetWhereInput => Boolean(clause));

  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    allows: (target) => compiled.some((source) => matches(source, membership, target)),
  };
}
