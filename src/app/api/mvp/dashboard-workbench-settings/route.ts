import { NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseDashboardWorkbenchConfig } from "@/lib/dashboard-workbench-config";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

async function canUseDashboard(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>, actionKey: "dashboard.view" | "dashboard.configure") {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canUseDashboard(auth, "dashboard.view");
  if (!permission.allowed) return fail("FORBIDDEN", "没有查看工作台配置的权限。", 403, { reasons: permission.reasons });

  const setting = await prisma.dashboardWorkbenchSetting.findUnique({
    where: { businessUnitId: auth.membership.businessUnitId },
  });
  return ok(parseDashboardWorkbenchConfig(setting));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canUseDashboard(auth, "dashboard.configure");
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置工作台统计卡片的权限。", 403, { reasons: permission.reasons });

  const body = await request.json().catch(() => null);
  const config = parseDashboardWorkbenchConfig(body);
  const requestedRoleIds = [...new Set(config.cards.flatMap((card) => card.audience.roleIds))];
  const requestedDepartmentIds = [...new Set(config.cards.flatMap((card) => card.audience.departmentIds))];
  const requestedMembershipIds = [...new Set(config.cards.flatMap((card) => card.audience.membershipIds))];
  const [roles, departments, memberships] = await Promise.all([
    // Roles are global definitions today, but a dashboard audience must only
    // reference roles that are actually in use by an active membership in the
    // current business unit. This prevents a crafted request from turning a
    // local workbench setting into a cross-unit role configuration.
    requestedRoleIds.length
      ? prisma.membership.findMany({
        where: {
          businessUnitId: auth.membership.businessUnitId,
          isActive: true,
          roleId: { in: requestedRoleIds },
        },
        distinct: ["roleId"],
        select: { roleId: true },
      })
      : [],
    requestedDepartmentIds.length
      ? prisma.department.findMany({ where: { id: { in: requestedDepartmentIds }, businessUnitId: auth.membership.businessUnitId, isActive: true }, select: { id: true } })
      : [],
    requestedMembershipIds.length
      ? prisma.membership.findMany({ where: { id: { in: requestedMembershipIds }, businessUnitId: auth.membership.businessUnitId, isActive: true }, select: { id: true } })
      : [],
  ]);
  const validRoleIds = new Set(roles.map((row) => row.roleId));
  const validDepartmentIds = new Set(departments.map((row) => row.id));
  const validMembershipIds = new Set(memberships.map((row) => row.id));
  const invalidAudience = config.cards.some((card) =>
    card.audience.roleIds.some((id) => !validRoleIds.has(id))
    || card.audience.departmentIds.some((id) => !validDepartmentIds.has(id))
    || card.audience.membershipIds.some((id) => !validMembershipIds.has(id)),
  );
  if (invalidAudience) {
    return fail("DASHBOARD_WIDGET_AUDIENCE_INVALID", "卡片适用的角色、部门或员工必须存在且属于当前业务板块。", 400);
  }

  const setting = await prisma.dashboardWorkbenchSetting.upsert({
    where: { businessUnitId: auth.membership.businessUnitId },
    update: {
      cards: config.cards as unknown as Prisma.InputJsonValue,
      updatedByUserId: auth.userId,
    },
    create: {
      businessUnitId: auth.membership.businessUnitId,
      cards: config.cards as unknown as Prisma.InputJsonValue,
      updatedByUserId: auth.userId,
    },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "dashboard.workbench_setting",
    action: "dashboard.configure",
    targetType: "dashboard_workbench_setting",
    targetId: setting.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      cards: config.cards.map((card) => ({
        key: card.key,
        isVisible: card.isVisible,
        zone: card.zone,
        sortOrder: card.sortOrder,
        audience: card.audience,
      })),
    } as Prisma.InputJsonObject,
  });
  return ok(config);
}
