import type { Prisma } from "@prisma/client";

import { normalizeScope, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export type FinanceAccessMembership = {
  id: string;
  roleId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
};

export type FinanceAccessTarget = {
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

export type FinanceAccessPlan = {
  allowed: boolean;
  canAccessStatements: boolean;
  canAccessCounterparties: boolean;
  canAccessPayments: boolean;
  sourceCount: number;
  statementWhere: Prisma.FinanceStatementWhereInput;
  counterpartyWhere: Prisma.FinanceCounterpartyWhereInput;
  paymentWhere: Prisma.FinancePaymentWhereInput;
  allows: (target: FinanceAccessTarget) => boolean;
  allowsCreate: (target: FinanceAccessTarget) => boolean;
};

function activeMembershipWhere(now: Date) {
  return {
    isActive: true,
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
}

function departmentTree(rows: Array<{ id: string; parentId: string | null }>, rootId: string | null) {
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

function subordinateMemberships(rows: Array<{ id: string; managerMembershipId: string | null }>, actorMembershipId: string) {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.managerMembershipId) continue;
    children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), row.id]);
  }
  const result = new Set<string>();
  const seen = new Set<string>();
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

function matchesSource(source: CompiledSource, membership: FinanceAccessMembership, target: FinanceAccessTarget) {
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
 * Creation needs a stricter interpretation than reading an existing record.
 * A SELF grant identifies the creator but must not be used to forge another
 * department or site onto a record. SUBORDINATES grants are read/manage scope,
 * not authority to create a record owned by the manager in a subordinate unit.
 */
function matchesCreateSource(source: CompiledSource, membership: FinanceAccessMembership, target: FinanceAccessTarget) {
  if (target.businessUnitId !== source.businessUnitId || target.ownerMembershipId !== membership.id) return false;
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return true;
  if (source.scope === "DEPARTMENT") return Boolean(source.departmentId && target.departmentId === source.departmentId);
  if (source.scope === "DEPARTMENT_TREE") return Boolean(target.departmentId && source.departmentIds.has(target.departmentId));
  if (source.scope === "SITE") return Boolean(source.siteId && target.siteId === source.siteId);
  if (source.scope === "SELF") {
    return target.departmentId === membership.departmentId && target.siteId === membership.siteId;
  }
  return false;
}

function statementClause(source: CompiledSource, membership: FinanceAccessMembership): Prisma.FinanceStatementWhereInput | null {
  const base = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return base;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...base, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const departmentIds = [...source.departmentIds];
    return departmentIds.length ? { ...base, departmentId: { in: departmentIds } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...base, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...base, createdByMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...base, createdByMembershipId: { in: membershipIds } } : null;
  }
  return null;
}

function counterpartyClause(source: CompiledSource, membership: FinanceAccessMembership): Prisma.FinanceCounterpartyWhereInput | null {
  const base = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return base;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...base, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const departmentIds = [...source.departmentIds];
    return departmentIds.length ? { ...base, departmentId: { in: departmentIds } } : null;
  }
  if (source.scope === "SELF") return { ...base, createdByMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...base, createdByMembershipId: { in: membershipIds } } : null;
  }
  // Counterparties are not site-scoped. A site-only grant cannot list or
  // configure a cross-site supplier record.
  return null;
}

function paymentClause(source: CompiledSource, membership: FinanceAccessMembership): Prisma.FinancePaymentWhereInput | null {
  const base = { businessUnitId: source.businessUnitId };
  if (source.scope === "ALL" || source.scope === "BUSINESS_UNIT") return base;
  if (source.scope === "DEPARTMENT") return source.departmentId ? { ...base, departmentId: source.departmentId } : null;
  if (source.scope === "DEPARTMENT_TREE") {
    const departmentIds = [...source.departmentIds];
    return departmentIds.length ? { ...base, departmentId: { in: departmentIds } } : null;
  }
  if (source.scope === "SITE") return source.siteId ? { ...base, siteId: source.siteId } : null;
  if (source.scope === "SELF") return { ...base, createdByMembershipId: membership.id };
  if (source.scope === "SUBORDINATES") {
    const membershipIds = [...source.subordinateMembershipIds];
    return membershipIds.length ? { ...base, createdByMembershipId: { in: membershipIds } } : null;
  }
  return null;
}

/**
 * Compiles one configured Action plus valid access grants into database
 * predicates. It runs on every request so an expired or revoked grant is not
 * hidden behind a stale permission cache.
 */
export async function createFinanceAccessPlan({
  membership,
  actionKey,
  now = new Date(),
}: {
  membership: FinanceAccessMembership;
  actionKey: string;
  now?: Date;
}): Promise<FinanceAccessPlan> {
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
  const subordinateIds = needsSubordinates ? subordinateMemberships(memberships, membership.id) : new Set<string>();
  const compiled = sources.map<CompiledSource>((source) => ({
    ...source,
    departmentIds: source.scope === "DEPARTMENT_TREE" ? departmentTree(departments, source.departmentId) : new Set<string>(),
    subordinateMembershipIds: source.scope === "SUBORDINATES" ? subordinateIds : new Set<string>(),
  }));
  const statementClauses = compiled
    .map((source) => statementClause(source, membership))
    .filter((clause): clause is Prisma.FinanceStatementWhereInput => Boolean(clause));
  const counterpartyClauses = compiled
    .map((source) => counterpartyClause(source, membership))
    .filter((clause): clause is Prisma.FinanceCounterpartyWhereInput => Boolean(clause));
  const paymentClauses = compiled
    .map((source) => paymentClause(source, membership))
    .filter((clause): clause is Prisma.FinancePaymentWhereInput => Boolean(clause));

  return {
    allowed: statementClauses.length > 0 || counterpartyClauses.length > 0 || paymentClauses.length > 0,
    canAccessStatements: statementClauses.length > 0,
    canAccessCounterparties: counterpartyClauses.length > 0,
    canAccessPayments: paymentClauses.length > 0,
    sourceCount: compiled.length,
    statementWhere: statementClauses.length ? { OR: statementClauses } : { OR: [] },
    counterpartyWhere: counterpartyClauses.length ? { OR: counterpartyClauses } : { OR: [] },
    paymentWhere: paymentClauses.length ? { OR: paymentClauses } : { OR: [] },
    allows: (target) => compiled.some((source) => matchesSource(source, membership, target)),
    allowsCreate: (target) => compiled.some((source) => matchesCreateSource(source, membership, target)),
  };
}
