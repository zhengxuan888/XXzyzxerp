import { NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { parseMarketingWorkbenchConfig } from "@/lib/marketing-workbench-config";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const configurationScopes = ["ALL", "BUSINESS_UNIT"] as const;

async function canUseWorkbench(
  auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>,
  actionKey: "marketing.workbench.view" | "marketing.workbench.configure",
) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetMembershipId: auth.membership.id,
    ...(actionKey === "marketing.workbench.configure" ? { allowedScopes: configurationScopes } : {}),
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const [permission, configurePermission] = await Promise.all([
    canUseWorkbench(auth, "marketing.workbench.view"),
    canUseWorkbench(auth, "marketing.workbench.configure"),
  ]);
  if (!permission.allowed) return fail("FORBIDDEN", "没有查看投放运营工作台配置的权限。", 403, { reasons: permission.reasons });

  const businessUnitId = auth.membership.businessUnitId;
  const [setting, metrics, actions, roles, departments, memberships] = await Promise.all([
    prisma.marketingWorkbenchSetting.findUnique({ where: { businessUnitId } }),
    configurePermission.allowed
      ? prisma.marketingMetricDefinition.findMany({ where: { businessUnitId, isActive: true }, select: { code: true, name: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })
      : [],
    configurePermission.allowed
      ? prisma.action.findMany({ select: { key: true, name: true }, orderBy: [{ namespace: "asc" }, { key: "asc" }] })
      : [],
    configurePermission.allowed
      ? prisma.role.findMany({
          where: { memberships: { some: { businessUnitId, isActive: true } } },
          select: { id: true, code: true, name: true },
          orderBy: [{ name: "asc" }, { code: "asc" }],
        })
      : [],
    configurePermission.allowed
      ? prisma.department.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
      : [],
    configurePermission.allowed
      ? prisma.membership.findMany({
          where: { businessUnitId, isActive: true, OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }] },
          select: { id: true, departmentId: true, user: { select: { fullName: true, username: true } } },
          orderBy: [{ user: { fullName: "asc" } }, { id: "asc" }],
        })
      : [],
  ]);
  return ok({
    ...parseMarketingWorkbenchConfig(setting),
    canConfigure: configurePermission.allowed,
    options: configurePermission.allowed
      ? {
          metrics,
          actions,
          roles,
          departments,
          memberships: memberships.map((membership) => ({ id: membership.id, departmentId: membership.departmentId, name: membership.user.fullName, username: membership.user.username })),
        }
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canUseWorkbench(auth, "marketing.workbench.configure");
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置投放运营工作台的权限。", 403, { reasons: permission.reasons });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { cards?: unknown }).cards)) {
    return fail("INVALID_WORKBENCH_CONFIG", "工作台配置必须包含卡片列表。", 400);
  }
  const config = parseMarketingWorkbenchConfig(body);
  if (config.cards.length !== (body as { cards: unknown[] }).cards.length) {
    return fail("INVALID_WORKBENCH_CONFIG", "存在无效、重复或不完整的工作台卡片配置。", 400);
  }
  const businessUnitId = auth.membership.businessUnitId;
  const requestedMetricCodes = [...new Set(config.cards.flatMap((card) => card.metricCode ? [card.metricCode] : []))];
  const requestedActionKeys = [...new Set(config.cards.flatMap((card) => card.actionKey ? [card.actionKey] : []))];
  const requestedRoleIds = [...new Set(config.cards.flatMap((card) => card.audience.roleIds))];
  const requestedDepartmentIds = [...new Set(config.cards.flatMap((card) => card.audience.departmentIds))];
  const requestedMembershipIds = [...new Set(config.cards.flatMap((card) => card.audience.membershipIds))];

  const [metrics, actions, roles, departments, memberships] = await Promise.all([
    requestedMetricCodes.length
      ? prisma.marketingMetricDefinition.findMany({ where: { businessUnitId, code: { in: requestedMetricCodes }, isActive: true }, select: { code: true } })
      : [],
    requestedActionKeys.length
      ? prisma.action.findMany({ where: { key: { in: requestedActionKeys } }, select: { key: true } })
      : [],
    requestedRoleIds.length
      ? prisma.membership.findMany({
          where: { businessUnitId, isActive: true, roleId: { in: requestedRoleIds } },
          distinct: ["roleId"],
          select: { roleId: true },
        })
      : [],
    requestedDepartmentIds.length
      ? prisma.department.findMany({ where: { id: { in: requestedDepartmentIds }, businessUnitId, isActive: true }, select: { id: true } })
      : [],
    requestedMembershipIds.length
      ? prisma.membership.findMany({ where: { id: { in: requestedMembershipIds }, businessUnitId, isActive: true }, select: { id: true } })
      : [],
  ]);
  const metricCodes = new Set(metrics.map((row) => row.code));
  const actionKeys = new Set(actions.map((row) => row.key));
  const roleIds = new Set(roles.map((row) => row.roleId));
  const departmentIds = new Set(departments.map((row) => row.id));
  const membershipIds = new Set(memberships.map((row) => row.id));
  const invalidReference = config.cards.some((card) =>
    (card.metricCode != null && !metricCodes.has(card.metricCode))
    || (card.actionKey != null && !actionKeys.has(card.actionKey))
    || card.audience.roleIds.some((id) => !roleIds.has(id))
    || card.audience.departmentIds.some((id) => !departmentIds.has(id))
    || card.audience.membershipIds.some((id) => !membershipIds.has(id)),
  );
  if (invalidReference) {
    return fail("MARKETING_WORKBENCH_REFERENCE_INVALID", "工作台卡片引用的指标、动作、角色、部门或员工不属于当前有效业务范围。", 400);
  }

  const setting = await prisma.marketingWorkbenchSetting.upsert({
    where: { businessUnitId },
    update: {
      cards: config.cards as unknown as Prisma.InputJsonValue,
      updatedByUserId: auth.userId,
    },
    create: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId,
      cards: config.cards as unknown as Prisma.InputJsonValue,
      updatedByUserId: auth.userId,
    },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.workbench_setting",
    action: "marketing.workbench.configure",
    targetType: "marketing_workbench_setting",
    targetId: setting.id,
    legalEntityId: auth.membership.legalEntityId,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      cards: config.cards.map((card) => ({
        key: card.key,
        kind: card.kind,
        metricCode: card.metricCode,
        queueKey: card.queueKey,
        actionKey: card.actionKey,
        isVisible: card.isVisible,
        zone: card.zone,
        sortOrder: card.sortOrder,
        audience: card.audience,
      })),
    } as Prisma.InputJsonObject,
  });
  return ok(config);
}
