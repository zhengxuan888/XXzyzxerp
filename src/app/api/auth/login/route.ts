import { NextResponse } from "next/server";

import { isSecureSessionCookie, issueSessionToken, resolvePrimaryMembership, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "请输入员工账号和密码。" }, { status: 400 });
  }

  const username = body.username.trim();
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
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
    return NextResponse.json({ error: "员工账号不存在或已停用。" }, { status: 401 });
  }

  const passwordValid = await verifyPassword(body.password, user.passwordHash ?? null);
  if (!passwordValid) {
    return NextResponse.json({ error: "密码不正确。" }, { status: 401 });
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
    return NextResponse.json({ error: "该账号没有可用岗位，请联系管理员。" }, { status: 403 });
  }

  const attendanceExempt = ["platform_admin", "business_manager", "legacy_admin", "legacy_ceo"].includes(selected.role?.code ?? "");
  const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (!attendanceExempt) await prisma.attendance.upsert({
    where: {
      businessUnitId_userId_attendanceDate_recordType: {
        businessUnitId: selected.businessUnitId,
        userId: user.id,
        attendanceDate: new Date(`${shanghaiDate}T00:00:00.000Z`),
        recordType: "CHECK_IN",
      },
    },
    update: {},
    create: {
      legalEntityId: selected.legalEntityId,
      businessUnitId: selected.businessUnitId,
      userId: user.id,
      membershipId: selected.id,
      siteId: selected.siteId,
      attendanceDate: new Date(`${shanghaiDate}T00:00:00.000Z`),
      recordType: "CHECK_IN",
      memo: "登录系统自动打卡",
    },
  });

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
    secure: isSecureSessionCookie(),
    maxAge: 60 * 60 * 8,
  });
  return response;
}
