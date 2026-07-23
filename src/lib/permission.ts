import { prisma } from "@/lib/prisma";

export type PermissionScope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "SITE" | "SELF" | "NONE";

export type PermissionDecision = {
  allowed: boolean;
  reasons: string[];
  source?: "role" | "access_grant";
};

export type PermissionContext = {
  userId: string;
  membershipId: string;
  actionKey: string;
  targetBusinessUnitId?: string | null;
  targetDepartmentId?: string | null;
  targetSiteId?: string | null;
  targetUserId?: string | null;
};

const scopeLevel: Record<PermissionScope, number> = {
  NONE: 0,
  SELF: 1,
  SITE: 2,
  DEPARTMENT: 2,
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
  if (value === "ALL" || value === "BUSINESS_UNIT" || value === "DEPARTMENT" || value === "SITE" || value === "SELF") {
    return value;
  }
  return "NONE";
}

function isScopedMatch({
  scope,
  actor,
  grant,
  target,
}: {
  scope: PermissionScope;
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
  if (scope === "ALL") return { allowed: true, reasons: ["SCOPE_ALL"] };
  if (scope === "NONE") return { allowed: false, reasons: ["SCOPE_NONE"] };

  const targetBU = target.targetBusinessUnitId ?? actor.businessUnitId;
  const targetDept = target.targetDepartmentId ?? actor.departmentId;
  const targetSite = target.targetSiteId ?? actor.siteId;

  if (scope === "BUSINESS_UNIT") {
    if (!targetBU) return { allowed: false, reasons: ["TARGET_BU_MISSING"] };
    if (targetBU !== actor.businessUnitId) {
      return { allowed: false, reasons: ["SCOPE_BUSINESS_UNIT_MISMATCH"] };
    }
    if (grant?.businessUnitId && grant.businessUnitId !== targetBU) {
      return { allowed: false, reasons: ["SCOPE_GRANT_BU_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_BUSINESS_UNIT_OK"] };
  }

  if (scope === "DEPARTMENT") {
    if (!targetBU || targetBU !== actor.businessUnitId) {
      return { allowed: false, reasons: ["SCOPE_BUSINESS_UNIT_MISMATCH"] };
    }
    const allowedDepartment = grant?.departmentId ?? actor.departmentId;
    if (!targetDept) return { allowed: false, reasons: ["TARGET_DEPARTMENT_MISSING"] };
    if (!allowedDepartment || targetDept !== allowedDepartment) {
      return { allowed: false, reasons: ["SCOPE_DEPARTMENT_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_DEPARTMENT_OK"] };
  }

  if (scope === "SITE") {
    if (!targetBU || targetBU !== actor.businessUnitId) {
      return { allowed: false, reasons: ["SCOPE_BUSINESS_UNIT_MISMATCH"] };
    }
    if (!targetSite) return { allowed: false, reasons: ["TARGET_SITE_MISSING"] };
    if (targetSite !== actor.siteId) {
      return { allowed: false, reasons: ["SCOPE_SITE_MISMATCH"] };
    }
    if (grant?.siteId && targetSite !== grant.siteId) {
      return { allowed: false, reasons: ["SCOPE_GRANT_SITE_MISMATCH"] };
    }
    return { allowed: true, reasons: ["SCOPE_SITE_OK"] };
  }

  if (scope === "SELF") {
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
    include: { role: true },
  });
  if (!membership) return null;
  return membership;
}

export async function getEffectiveActions(membershipId: string): Promise<Set<string>> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { role: true },
  });
  if (!membership) return new Set<string>();

  const now = new Date();
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: membership.roleId, isAllowed: true },
    select: { actionKey: true },
  });

  const grants = await prisma.accessGrant.findMany({
    where: {
      granteeMembershipId: membership.id,
      isActive: true,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { actionKey: true },
  });

  const actionSet = new Set<string>();
  rolePerms.forEach((p) => actionSet.add(p.actionKey));
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
    const scope = normalizeScope(perm.scope);
    const result = isScopedMatch({ scope, actor, target: ctx });
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
    const result = isScopedMatch({
      scope,
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
