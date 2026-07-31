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

export type DocumentAccessTarget = {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  ownerUserId: string;
  ownerMembershipId: string | null;
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
  subordinateUserIds: Set<string>;
};

export type DocumentAccessPlan = {
  allowed: boolean;
  where: Prisma.DocumentWhereInput;
  allows: (target: DocumentAccessTarget) => boolean;
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

function collectSubordinates(rows: Array<{ id: string; userId: string; managerMembershipId: string | null }>, actorMembershipId: string) {
  const children = new Map<string, Array<{ id: string; userId: string }>>();
  for (const row of rows) {
    if (row.managerMembershipId) {
      children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), { id: row.id, userId: row.userId }]);
    }
  }
  const membershipIds = new Set<string>();
  const userIds = new Set<string>();
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const row = queue.shift();
    if (!row || membershipIds.has(row.id)) continue;
    membershipIds.add(row.id);
    userIds.add(row.userId);
    queue.push(...(children.get(row.id) ?? []));
  }
  return { membershipIds, userIds };
}

function clauseFor(source: CompiledSource, membership: MembershipLike): Prisma.DocumentWhereInput | null {
  const inBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return inBusinessUnit;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...inBusinessUnit, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const ids = [...source.departmentIds];
    return ids.length ? { ...inBusinessUnit, departmentId: { in: ids } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...inBusinessUnit, siteId: source.siteId } : null;
  if (source.scope === "SELF") {
    return {
      ...inBusinessUnit,
      OR: [{ ownerMembershipId: membership.id }, { ownerMembershipId: null, ownerUserId: membership.userId }],
    };
  }
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    const userIds = [...source.subordinateUserIds];
    if (membershipIds.length === 0 && userIds.length === 0) return null;
    return {
      ...inBusinessUnit,
      OR: [
        ...(membershipIds.length ? [{ ownerMembershipId: { in: membershipIds } }] : []),
        ...(userIds.length ? [{ ownerMembershipId: null, ownerUserId: { in: userIds } }] : []),
      ],
    };
  }
  return null;
}

function matches(source: CompiledSource, membership: MembershipLike, target: DocumentAccessTarget) {
  if (target.businessUnitId !== source.businessUnitId) return false;
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return true;
  if (source.scope === "DEPARTMENT") return Boolean(source.departmentId && target.departmentId === source.departmentId);
  if (source.scope === "DEPARTMENT_TREE") return Boolean(target.departmentId && source.departmentIds.has(target.departmentId));
  if (source.scope === "SITE") return Boolean(source.siteId && target.siteId === source.siteId);
  if (source.scope === "SELF") return target.ownerMembershipId === membership.id || (!target.ownerMembershipId && target.ownerUserId === membership.userId);
  if (source.scope === "SUBORDINATES") {
    return Boolean(
      (target.ownerMembershipId && source.subordinateMembershipIds.has(target.ownerMembershipId))
      || (!target.ownerMembershipId && source.subordinateUserIds.has(target.ownerUserId)),
    );
  }
  return false;
}

/**
 * Compiles the database-driven role permissions and active access grants into
 * a single document predicate. Legacy documents that predate Membership keep
 * their ownerUserId fallback, so a migration never widens visibility by
 * inventing a new owner relationship.
 */
export async function createDocumentAccessPlan({
  membership,
  actionKey = "document.read",
  now = new Date(),
}: {
  membership: MembershipLike;
  actionKey?: string;
  now?: Date;
}): Promise<DocumentAccessPlan> {
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
          select: { id: true, userId: true, managerMembershipId: true },
        })
      : Promise.resolve([]),
  ]);

  const subordinates = needsSubordinates
    ? collectSubordinates(memberships, membership.id)
    : { membershipIds: new Set<string>(), userIds: new Set<string>() };
  const compiled = sources.map<CompiledSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? collectDepartmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinates.membershipIds : new Set<string>(),
    subordinateUserIds: source.scope === "SUBORDINATES" ? subordinates.userIds : new Set<string>(),
  }));
  const clauses = compiled
    .map((source) => clauseFor(source, membership))
    .filter((clause): clause is Prisma.DocumentWhereInput => Boolean(clause));

  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    allows: (target) => compiled.some((source) => matches(source, membership, target)),
  };
}
