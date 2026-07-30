import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type AuthContext = {
  userId: string;
  username: string;
  activeMembershipId: string;
  membership: {
    id: string;
    roleId: string;
    businessUnitId: string;
    departmentId: string | null;
    siteId: string | null;
    userId: string;
    legalEntityId: string;
  };
};

export async function requireAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const session = await getSessionFromRequest(req);
  if (!session?.activeMembershipId) return null;

  const membership = await prisma.membership.findFirst({
    where: {
      id: session.activeMembershipId,
      userId: session.userId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gte: new Date() } }],
    },
    include: {
      user: { select: { id: true, isActive: true } },
      legalEntity: { select: { id: true, isActive: true } },
      businessUnit: { include: { legalEntity: { select: { id: true, isActive: true } } } },
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

  return {
    userId: session.userId,
    username: session.username,
    activeMembershipId: membership.id,
    membership: {
      id: membership.id,
      roleId: membership.roleId,
      businessUnitId: membership.businessUnitId,
      departmentId: membership.departmentId,
      siteId: membership.siteId,
      userId: membership.userId,
      legalEntityId: membership.legalEntityId,
    },
  };
}
