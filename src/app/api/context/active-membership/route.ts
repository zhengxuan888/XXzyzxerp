import { NextRequest, NextResponse } from "next/server";

import { getActiveMembershipById, issueSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const formBody = await request.formData().catch(() => null);
  const jsonBody = await request.json().catch(() => null);
  const body = (() => {
    if (formBody) {
      const membershipId = formBody.get("membershipId");
      if (typeof membershipId === "string") return { membershipId };
    }
    if (jsonBody && typeof jsonBody.membershipId === "string") return { membershipId: jsonBody.membershipId };
    return null;
  })();
  if (!body || typeof body.membershipId !== "string") {
    return NextResponse.json({ error: "membershipId is required." }, { status: 400 });
  }

  const membership = await getActiveMembershipById(body.membershipId);
  if (!membership || membership.userId !== session.userId) {
    return NextResponse.json({ error: "Invalid membership context." }, { status: 404 });
  }

  const token = await issueSessionToken({
    userId: session.userId,
    username: session.username,
    activeMembershipId: membership.id,
  });

  await prisma.auditLog.create({
    data: {
      action: "context.switch",
      actorUserId: session.userId,
      actorMembershipId: membership.id,
      module: "auth",
      targetType: "membership",
      targetId: membership.id,
      businessUnitId: membership.businessUnitId,
      roleId: membership.roleId,
      details: { from: session.activeMembershipId },
    },
  });

  const response = NextResponse.json({ token, activeMembershipId: membership.id });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
