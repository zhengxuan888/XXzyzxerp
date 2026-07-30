import { NextResponse } from "next/server";

import { issueSessionToken, resolvePrimaryMembership, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Please provide username and password." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username: body.username },
    include: {
      memberships: {
        where: {
          isActive: true,
          OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
        },
        include: {
          role: true,
          legalEntity: { select: { id: true, isActive: true } },
          businessUnit: { include: { legalEntity: { select: { id: true, isActive: true } } } },
        },
      },
    },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User does not exist or is disabled." }, { status: 401 });
  }

  const passwordValid = await verifyPassword(body.password, user.passwordHash ?? null);
  if (!passwordValid) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 401 });
  }

  const usableMemberships = user.memberships.filter((membership) => (
    membership.legalEntity.isActive
    && membership.businessUnit.isActive
    && membership.businessUnit.legalEntity.isActive
    && membership.businessUnit.legalEntityId === membership.legalEntityId
  ));
  const explicitMembershipId = typeof body.membershipId === "string" ? body.membershipId : null;
  const primary = await resolvePrimaryMembership(user.id);
  const selected = explicitMembershipId
    ? usableMemberships.find((m) => m.id === explicitMembershipId) ?? primary
    : primary;

  if (!selected) {
    return NextResponse.json({ error: "No usable membership found for this user." }, { status: 403 });
  }

  const token = await issueSessionToken({
    userId: user.id,
    username: user.username,
    activeMembershipId: selected.id,
  });

  const response = NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      activeMembership: {
        id: selected.id,
        businessUnitId: selected.businessUnitId,
        departmentId: selected.departmentId,
        role: selected.role?.code,
      },
    },
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
