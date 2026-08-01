import type { Prisma } from "@prisma/client";

import { normalizeScope, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export type MarketingMembership = {
  id: string;
  userId: string;
  roleId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

export type MarketingAccessTarget = {
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

type CompiledSource = ScopeSource & {
  departmentIds: Set<string>;
  subordinateMembershipIds: Set<string>;
};

export type MarketingReportAccessPlan = {
  allowed: boolean;
  where: Prisma.MarketingDailyReportWhereInput;
  allows: (target: MarketingAccessTarget) => boolean;
};

export type MarketingCreativeAccessPlan = {
  allowed: boolean;
  where: Prisma.MarketingCreativeWhereInput;
  allows: (target: MarketingAccessTarget) => boolean;
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

function matches(source: CompiledSource, membership: MarketingMembership, target: MarketingAccessTarget) {
  if (target.businessUnitId !== source.businessUnitId) return false;
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return true;
  if (source.scope === "DEPARTMENT") return Boolean(source.departmentId && target.departmentId === source.departmentId);
  if (source.scope === "DEPARTMENT_TREE") return Boolean(target.departmentId && source.departmentIds.has(target.departmentId));
  if (source.scope === "SITE") return Boolean(source.siteId && target.siteId === source.siteId);
  if (source.scope === "SELF") return target.ownerMembershipId === membership.id;
  if (source.scope === "SUBORDINATES") return source.subordinateMembershipIds.has(target.ownerMembershipId);
  return false;
}

function reportClauseFor(source: CompiledSource, membership: MarketingMembership): Prisma.MarketingDailyReportWhereInput | null {
  const inBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return inBusinessUnit;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...inBusinessUnit, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const departmentIds = [...source.departmentIds];
    return departmentIds.length ? { ...inBusinessUnit, departmentId: { in: departmentIds } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...inBusinessUnit, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...inBusinessUnit, ownerMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...inBusinessUnit, ownerMembershipId: { in: membershipIds } } : null;
  }
  return null;
}

function creativeClauseFor(source: CompiledSource, membership: MarketingMembership): Prisma.MarketingCreativeWhereInput | null {
  const inBusinessUnit = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return inBusinessUnit;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...inBusinessUnit, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const departmentIds = [...source.departmentIds];
    return departmentIds.length ? { ...inBusinessUnit, departmentId: { in: departmentIds } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...inBusinessUnit, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...inBusinessUnit, ownerMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...inBusinessUnit, ownerMembershipId: { in: membershipIds } } : null;
  }
  return null;
}

async function compileSources({ membership, actionKey, now }: { membership: MarketingMembership; actionKey: string; now: Date }) {
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

  // Conditions are intentionally fail-closed until a condition interpreter is
  // added. A stored condition must never become an implicit broad allow.
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
  return sources.map<CompiledSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? collectDepartmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinateMembershipIds : new Set<string>(),
  }));
}

/**
 * One compiled predicate is shared by marketing report list/detail/write APIs.
 * This keeps a direct URL or API call from bypassing a hidden UI control.
 */
export async function createMarketingReportAccessPlan({
  membership,
  actionKey = "marketing.report.read",
  now = new Date(),
}: {
  membership: MarketingMembership;
  actionKey?: string;
  now?: Date;
}): Promise<MarketingReportAccessPlan> {
  const sources = await compileSources({ membership, actionKey, now });
  const clauses = sources
    .map((source) => reportClauseFor(source, membership))
    .filter((clause): clause is Prisma.MarketingDailyReportWhereInput => Boolean(clause));
  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    allows: (target) => sources.some((source) => matches(source, membership, target)),
  };
}

export async function createMarketingCreativeAccessPlan({
  membership,
  actionKey = "marketing.creative.read",
  now = new Date(),
}: {
  membership: MarketingMembership;
  actionKey?: string;
  now?: Date;
}): Promise<MarketingCreativeAccessPlan> {
  const sources = await compileSources({ membership, actionKey, now });
  const clauses = sources
    .map((source) => creativeClauseFor(source, membership))
    .filter((clause): clause is Prisma.MarketingCreativeWhereInput => Boolean(clause));
  return {
    allowed: clauses.length > 0,
    where: clauses.length ? { OR: clauses } : { OR: [] },
    allows: (target) => sources.some((source) => matches(source, membership, target)),
  };
}
