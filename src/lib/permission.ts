import { prisma } from "@/lib/prisma";

export type PermissionScope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "DEPARTMENT_TREE" | "SUBORDINATES" | "SITE" | "SELF" | "NONE";

export type PermissionDecision = {
  allowed: boolean;
  reasons: string[];
  source?: "role" | "access_grant";
};

export type PermissionContext = {
  userId: string;
  membershipId: string;
  actionKey: string;
  // Some configuration records govern an entire business unit and must not be
  // changed through a narrower department/site/self grant. Callers opt in to
  // this restriction; ordinary record permissions keep their existing scope
  // behavior.
  allowedScopes?: readonly PermissionScope[];
  targetBusinessUnitId?: string | null;
  targetDepartmentId?: string | null;
  targetSiteId?: string | null;
  targetUserId?: string | null;
  targetMembershipId?: string | null;
};

const scopeLevel: Record<PermissionScope, number> = {
  NONE: 0,
  SELF: 1,
  SITE: 2,
  DEPARTMENT: 2,
  DEPARTMENT_TREE: 2,
  SUBORDINATES: 2,
  BUSINESS_UNIT: 3,
  ALL: 4,
};

function isActive(entity: { isActive?: boolean; endedAt?: Date | null } | null, at: Date) {
  if (!entity || entity.isActive === false) return false;
  if (entity.endedAt && entity.endedAt.getTime() <= at.getTime()) return false;
  return true;
}

export function normalizeScope(scope?: string | null): PermissionScope {
  if (!scope) return "NONE";
  const value = String(scope).toUpperCase();
  if (value === "ALL" || value === "BUSINESS_UNIT" || value === "DEPARTMENT" || value === "DEPARTMENT_TREE" || value === "SUBORDINATES" || value === "SITE" || value === "SELF") {
    return value;
  }
  return "NONE";
}

async function isInReportingScope(
  actorMembershipId: string,
  targetMembershipId: string | null | undefined,
  targetUserId: string | null | undefined,
  includeActor: boolean,
  targetBusinessUnitId: string,
) {
  if (!targetMembershipId && !targetUserId) return false;
  const now = new Date();
  const rows = await prisma.membership.findMany({
    where: {
      businessUnitId: targetBusinessUnitId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    select: { id: true, userId: true, businessUnitId: true, managerMembershipId: true },
  });
  const children = new Map<string, string[]>();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) if (row.managerMembershipId) children.set(row.managerMembershipId, [...(children.get(row.managerMembershipId) ?? []), row.id]);
  const actor = byId.get(actorMembershipId);
  if (!actor) return false;
  const allowedMembershipIds = new Set<string>(includeActor ? [actor.id] : []);
  const allowedUserIds = new Set<string>(includeActor ? [actor.userId] : []);
  const queue = [...(children.get(actorMembershipId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    const row = byId.get(id);
    if (row) {
      allowedMembershipIds.add(row.id);
      allowedUserIds.add(row.userId);
    }
    queue.push(...(children.get(id) ?? []));
  }
  return targetMembershipId ? allowedMembershipIds.has(targetMembershipId) : allowedUserIds.has(targetUserId!);
}

async function isDepartmentTreeScope(
  businessUnitId: string,
  rootDepartmentId: string | null | undefined,
  targetDepartmentId: string | null | undefined,
) {
  if (!targetDepartmentId) return false;
  if (!rootDepartmentId) return false;
  if (targetDepartmentId === rootDepartmentId) return true;
  const departments = await prisma.department.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, parentId: true } });
  const children = new Map<string, string[]>();
  for (const row of departments) if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  const queue = [...(children.get(rootDepartmentId) ?? [])];
  while (queue.length) { const id = queue.shift()!; if (id === targetDepartmentId) return true; queue.push(...(children.get(id) ?? [])); }
  return false;
}

function isScopedMatch({
  scope,
  actor,
  actorMembershipId,
  grant,
  target,
}: {
  scope: PermissionScope;
  actorMembershipId: string;
  actor: {
    businessUnitId: string | null;
    departmentId: string | null;
    siteId: string | null;
    userId: string;
  };
  grant?: {
    businessUnitId?: string | null;
    departmentId?: string | null;
    siteId?: string | null;
  };
  target: PermissionContext;
}) {
  if (scope === "NONE") return { allowed: false, reasons: ["SCOPE_NONE"] };

  const targetBU = target.targetBusinessUnitId ?? actor.businessUnitId;
  const targetDept = target.targetDepartmentId ?? actor.departmentId;
  const targetSite = target.targetSiteId ?? actor.siteId;
  const scopedBusinessUnit = grant?.businessUnitId ?? actor.businessUnitId;

  if (!targetBU || targetBU !== scopedBusinessUnit) {
    return { allowed: false, reasons: ["SCOPE_BUSINESS_UNIT_MISMATCH"] };
  }

  if (scope === "ALL") return { allowed: true, reasons: ["SCOPE_ALL"] };

  if (scope === "BUSINESS_UNIT") {
    return { allowed: true, reasons: ["SCOPE_BUSINESS_UNIT_OK"] };
  }

  if (scope === "DEPARTMENT") {
    const allowedDepartment = grant?.departmentId ?? actor.departmentId;
    if (!targetDept) return { allowed: false, reasons: ["TARGET_DEPARTMENT_MISSING"] };
    if (!allowedDepartment || targetDept !== allowedDepartment) {
      return { allowed: false, reasons: ["SCOPE_DEPARTMENT_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_DEPARTMENT_OK"] };
  }

  if (scope === "SITE") {
    if (!targetSite) return { allowed: false, reasons: ["TARGET_SITE_MISSING"] };
    const allowedSite = grant?.siteId ?? actor.siteId;
    if (targetSite !== allowedSite) {
      return { allowed: false, reasons: ["SCOPE_SITE_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_SITE_OK"] };
  }

  if (scope === "SELF") {
    if (target.targetMembershipId) {
      if (target.targetMembershipId !== actorMembershipId) {
        return { allowed: false, reasons: ["SCOPE_SELF_MISMATCH"] };
      }
      return { allowed: true, reasons: ["SCOPE_SELF_OK"] };
    }
    if (!target.targetUserId) return { allowed: false, reasons: ["TARGET_USER_MISSING"] };
    if (target.targetUserId !== actor.userId) {
      return { allowed: false, reasons: ["SCOPE_SELF_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_SELF_OK"] };
  }

  return { allowed: false, reasons: ["SCOPE_UNKNOWN"] };
}

async function getMembershipByIdOrThrow(membershipId: string, userId: string) {
  const now = new Date();
  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      userId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: {
      role: true,
      user: { select: { isActive: true } },
      legalEntity: { select: { isActive: true } },
      businessUnit: { include: { legalEntity: { select: { isActive: true } } } },
    },
  });
  if (
    !membership
    || !membership.user.isActive
    || !membership.legalEntity.isActive
    || !membership.businessUnit.isActive
    || !membership.businessUnit.legalEntity.isActive
    || membership.businessUnit.legalEntityId !== membership.legalEntityId
  ) return null;
  return membership;
}

export async function getEffectiveActions(membershipId: string): Promise<Set<string>> {
  const now = new Date();
  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: {
      role: true,
      user: { select: { isActive: true } },
      legalEntity: { select: { isActive: true } },
      businessUnit: { include: { legalEntity: { select: { isActive: true } } } },
    },
  });
  if (
    !membership
    || !membership.user.isActive
    || !membership.legalEntity.isActive
    || !membership.businessUnit.isActive
    || !membership.businessUnit.legalEntity.isActive
    || membership.businessUnit.legalEntityId !== membership.legalEntityId
  ) return new Set<string>();

  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: membership.roleId, isAllowed: true },
    // A conditional permission is not an unconditional menu capability.
    // Until its condition has a server-side evaluator, keep it fail-closed
    // here as well as in checkPermission().
    select: { actionKey: true, conditions: true },
  });

  const grants = await prisma.accessGrant.findMany({
    where: {
      granteeMembershipId: membership.id,
      businessUnitId: membership.businessUnitId,
      isActive: true,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { actionKey: true },
  });

  const actionSet = new Set<string>();
  rolePerms
    .filter((permission) => permission.conditions == null)
    .forEach((permission) => actionSet.add(permission.actionKey));
  grants.forEach((g) => actionSet.add(g.actionKey));
  return actionSet;
}

export async function checkPermission(ctx: PermissionContext): Promise<PermissionDecision> {
  const now = new Date();
  const membership = await getMembershipByIdOrThrow(ctx.membershipId, ctx.userId);
  if (!membership) {
    return { allowed: false, reasons: ["SESSION_INVALID_MEMBERSHIP"] };
  }
  if (!isActive(membership, now)) {
    return { allowed: false, reasons: ["MEMBERSHIP_EXPIRED"] };
  }

  const actor = {
    businessUnitId: membership.businessUnitId,
    departmentId: membership.departmentId,
    siteId: membership.siteId,
    userId: membership.userId,
  };

  const rolePerms = await prisma.rolePermission.findMany({
    where: {
      roleId: membership.roleId,
      actionKey: ctx.actionKey,
      isAllowed: true,
    },
  });

  for (const perm of rolePerms) {
    // Conditions are configuration, not decoration. Until a condition has a
    // server-side evaluator, do not silently widen access by ignoring it.
    if (perm.conditions != null) continue;
    const scope = normalizeScope(perm.scope);
    if (ctx.allowedScopes && !ctx.allowedScopes.includes(scope)) continue;
    if (scope === "SUBORDINATES") {
      if (ctx.targetBusinessUnitId !== membership.businessUnitId) continue;
      if (await isInReportingScope(membership.id, ctx.targetMembershipId, ctx.targetUserId, false, membership.businessUnitId)) return { allowed: true, reasons: ["SCOPE_SUBORDINATES_OK", "ROLE_PERMISSION"], source: "role" };
      continue;
    }
    if (scope === "DEPARTMENT_TREE") {
      if (ctx.targetBusinessUnitId !== membership.businessUnitId) continue;
      if (await isDepartmentTreeScope(membership.businessUnitId, membership.departmentId, ctx.targetDepartmentId ?? membership.departmentId)) return { allowed: true, reasons: ["SCOPE_DEPARTMENT_TREE_OK", "ROLE_PERMISSION"], source: "role" };
      continue;
    }
    const result = isScopedMatch({ scope, actor, actorMembershipId: membership.id, target: ctx });
    if (result.allowed) {
      return {
        allowed: true,
        reasons: [...result.reasons, "ROLE_PERMISSION"],
        source: "role",
      };
    }
  }

  const grantPerms = await prisma.accessGrant.findMany({
    where: {
      granteeMembershipId: membership.id,
      actionKey: ctx.actionKey,
      isActive: true,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
  });

  for (const grant of grantPerms) {
    const expired = grant.expiresAt ? grant.expiresAt.getTime() <= now.getTime() : false;
    if (expired) continue;

    const scope = normalizeScope(grant.scope);
    if (ctx.allowedScopes && !ctx.allowedScopes.includes(scope)) continue;
    if (scope === "SUBORDINATES") {
      if (ctx.targetBusinessUnitId !== grant.businessUnitId) continue;
      if (await isInReportingScope(membership.id, ctx.targetMembershipId, ctx.targetUserId, false, grant.businessUnitId)) return { allowed: true, reasons: ["SCOPE_SUBORDINATES_OK", "ACCESS_GRANT"], source: "access_grant" };
      continue;
    }
    if (scope === "DEPARTMENT_TREE") {
      if (ctx.targetBusinessUnitId !== grant.businessUnitId) continue;
      if (await isDepartmentTreeScope(grant.businessUnitId, grant.departmentId, ctx.targetDepartmentId ?? grant.departmentId)) return { allowed: true, reasons: ["SCOPE_DEPARTMENT_TREE_OK", "ACCESS_GRANT"], source: "access_grant" };
      continue;
    }
    const result = isScopedMatch({
      scope,
      actorMembershipId: membership.id,
      actor: {
        businessUnitId: grant.businessUnitId,
        departmentId: grant.departmentId ?? null,
        siteId: grant.siteId ?? null,
        userId: membership.userId,
      },
      grant: {
        businessUnitId: grant.businessUnitId,
        departmentId: grant.departmentId,
        siteId: grant.siteId,
      },
      target: ctx,
    });
    if (result.allowed) {
      return {
        allowed: true,
        reasons: [...result.reasons, "ACCESS_GRANT"],
        source: "access_grant",
      };
    }
  }

  return { allowed: false, reasons: ["PERMISSION_DENIED"] };
}

export async function getAllowedActionsForSession({
  userId,
  membershipId,
}: {
  userId: string;
  membershipId: string;
}) {
  const membership = await getMembershipByIdOrThrow(membershipId, userId);
  if (!membership) return [] as string[];
  const set = await getEffectiveActions(membership.id);
  return [...set];
}

export async function assertGrantRule(ctx: {
  actorMembershipId: string;
  actorUserId: string;
  actionKey: string;
  requestedScope: PermissionScope;
  target: {
    businessUnitId: string;
    departmentId?: string | null;
    siteId?: string | null;
  };
}) {
  const actor = await prisma.membership.findUnique({ where: { id: ctx.actorMembershipId }, include: { role: true } });
  if (!actor) {
    return { allowed: false, reasons: ["ACTOR_MEMBERSHIP_MISSING"] };
  }

  const canCreate = await checkPermission({
    userId: ctx.actorUserId,
    membershipId: actor.id,
    actionKey: "access_grant.create",
    targetBusinessUnitId: ctx.target.businessUnitId,
    targetDepartmentId: ctx.target.departmentId ?? null,
    targetSiteId: ctx.target.siteId ?? null,
  });

  if (!canCreate.allowed) {
    return { allowed: false, reasons: ["GRANT_ACTION_DENIED"] };
  }

  // Imported administrator roles predate delegation-rule records. They still
  // must own the action and target scope, but do not require a duplicate rule.
  const trustedAdministrator = ["platform_admin", "legacy_admin"].includes(actor.role.code);
  if (trustedAdministrator) {
    const grantTarget = await checkPermission({
      userId: ctx.actorUserId,
      membershipId: actor.id,
      actionKey: ctx.actionKey,
      targetBusinessUnitId: ctx.target.businessUnitId,
      targetDepartmentId: ctx.target.departmentId ?? null,
      targetSiteId: ctx.target.siteId ?? null,
    });
    if (!grantTarget.allowed) return { allowed: false, reasons: ["REQUEST_TARGET_OUT_OF_SCOPE"] };
    return { allowed: true, reasons: ["ADMINISTRATOR_DELEGATION"] };
  }

  const roleLevelRule = await prisma.delegationRule.findUnique({
    where: { roleId_actionKey: { roleId: actor.roleId, actionKey: ctx.actionKey } },
  });
  if (!roleLevelRule) {
    return { allowed: false, reasons: ["DELEGATION_RULE_MISSING"] };
  }

  const canTransfer = roleLevelRule?.canTransfer ?? false;
  if (!canTransfer) {
    return { allowed: false, reasons: ["DELEGATION_NOT_ALLOWED"] };
  }

  const grantTarget = await checkPermission({
    userId: ctx.actorUserId,
    membershipId: actor.id,
    actionKey: ctx.actionKey,
    targetBusinessUnitId: ctx.target.businessUnitId,
    targetDepartmentId: ctx.target.departmentId ?? null,
    targetSiteId: ctx.target.siteId ?? null,
  });
  if (!grantTarget.allowed) return { allowed: false, reasons: ["REQUEST_TARGET_OUT_OF_SCOPE"] };

  const actorPerm = await prisma.rolePermission.findUnique({
    where: { roleId_actionKey: { roleId: actor.roleId, actionKey: ctx.actionKey } },
    select: { scope: true },
  });
  const actorScope = normalizeScope(actorPerm?.scope);
  const allowedMax = Math.min(scopeLevel[normalizeScope(roleLevelRule.maxScope)], scopeLevel[actorScope]);
  const requested = scopeLevel[normalizeScope(ctx.requestedScope)];
  if (requested > allowedMax) {
    return { allowed: false, reasons: ["SCOPE_EXCEEDS_DELEGATION"] };
  }

  return { allowed: true, reasons: ["DELEGATION_OK"] };
}
