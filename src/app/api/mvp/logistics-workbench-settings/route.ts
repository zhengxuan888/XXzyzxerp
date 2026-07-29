import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const read = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!read.allowed) return fail("FORBIDDEN", "无权查看物流工作台配置。", 403);
  const setting = await prisma.logisticsWorkbenchSetting.findUnique({
    where: { businessUnitId: auth.membership.businessUnitId },
  });
  return ok(parseLogisticsWorkbenchConfig(setting));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const manage = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.workbench.configure",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!manage.allowed) return fail("FORBIDDEN", "无权配置物流工作台。", 403);
  const body = await request.json().catch(() => null);
  const config = parseLogisticsWorkbenchConfig(body);
  const setting = await prisma.logisticsWorkbenchSetting.upsert({
    where: { businessUnitId: auth.membership.businessUnitId },
    update: {
      quickTags: config.quickTags,
      cards: config.cards as unknown as Prisma.InputJsonValue,
      alertRules: config.alertRules as unknown as Prisma.InputJsonValue,
      syncIntervalMinutes: config.syncIntervalMinutes,
      feishuNotificationsEnabled: config.feishuNotificationsEnabled,
      feishuHighPriorityOnly: config.feishuHighPriorityOnly,
      updatedByUserId: auth.userId,
    },
    create: {
      businessUnitId: auth.membership.businessUnitId,
      quickTags: config.quickTags,
      cards: config.cards as unknown as Prisma.InputJsonValue,
      alertRules: config.alertRules as unknown as Prisma.InputJsonValue,
      syncIntervalMinutes: config.syncIntervalMinutes,
      feishuNotificationsEnabled: config.feishuNotificationsEnabled,
      feishuHighPriorityOnly: config.feishuHighPriorityOnly,
      updatedByUserId: auth.userId,
    },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.workbench_setting",
    action: "shipment.workbench.configure",
    targetType: "logistics_workbench_setting",
    targetId: setting.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { quickTagCount: config.quickTags.length, cards: config.cards, alertRuleCount: config.alertRules.length, syncIntervalMinutes: config.syncIntervalMinutes, feishuNotificationsEnabled: config.feishuNotificationsEnabled, feishuHighPriorityOnly: config.feishuHighPriorityOnly } as unknown as Prisma.InputJsonObject,
  });
  return ok(config);
}
