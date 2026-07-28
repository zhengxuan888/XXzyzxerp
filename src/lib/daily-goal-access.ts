import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type Actor = {
  id: string;
  userId: string;
  businessUnitId: string;
};

export async function getVisibleGoalMemberships(actor: Actor) {
  const candidates = await prisma.membership.findMany({
    where: {
      businessUnitId: actor.businessUnitId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      siteId: true,
      managerMembershipId: true,
      user: { select: { fullName: true, username: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ department: { sortOrder: "asc" } }, { user: { fullName: "asc" } }],
  });

  const visibility = await Promise.all(
    candidates.map(async (candidate) => {
      const actionKey = candidate.id === actor.id ? "daily_goal.read" : "daily_goal.manage";
      const decision = await checkPermission({
        userId: actor.userId,
        membershipId: actor.id,
        actionKey,
        targetBusinessUnitId: actor.businessUnitId,
        targetDepartmentId: candidate.departmentId,
        targetSiteId: candidate.siteId,
        targetUserId: candidate.userId,
      });
      return decision.allowed;
    }),
  );

  return candidates.filter((_, index) => visibility[index]);
}

export async function canEditGoalMembership(actor: Actor, target: {
  id: string;
  userId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
}) {
  if (target.businessUnitId !== actor.businessUnitId) return false;
  const decision = await checkPermission({
    userId: actor.userId,
    membershipId: actor.id,
    actionKey: target.id === actor.id ? "daily_goal.create" : "daily_goal.manage",
    targetBusinessUnitId: target.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.userId,
  });
  return decision.allowed;
}
