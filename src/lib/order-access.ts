import { prisma } from "@/lib/prisma";
import { checkPermission } from "@/lib/permission";

export type OrderReadScope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "SITE" | "SELF" | "NONE";

type MembershipLike = {
  id: string;
  userId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
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
  userId,
  orderId,
}: {
  membership: MembershipLike;
  userId: string;
  orderId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { businessUnitId: true, departmentId: true, siteId: true, creatorUserId: true, ownedByMembershipId: true },
  });
  if (!order || order.businessUnitId !== membership.businessUnitId) return false;

  const scope = await resolveOrderReadScope(membership, userId);
  if (scope === "NONE") return false;
  if (scope === "ALL" || scope === "BUSINESS_UNIT") return true;
  if (scope === "DEPARTMENT") return order.departmentId === membership.departmentId;
  if (scope === "SITE") return order.siteId === membership.siteId;
  return order.ownedByMembershipId === membership.id;
}
