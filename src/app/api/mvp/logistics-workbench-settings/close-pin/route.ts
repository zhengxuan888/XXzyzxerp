import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.workbench.configure", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "无权查看结束订单确认码配置。", 403);
  const setting = await prisma.logisticsWorkbenchSetting.findUnique({ where: { businessUnitId: auth.membership.businessUnitId }, select: { closeOrderPinHash: true } });
  return ok({ configured: Boolean(setting?.closeOrderPinHash) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.workbench.configure", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "无权设置结束订单确认码。", 403);
  const body = await request.json().catch(() => null) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  if (!/^\d{4}$/.test(pin)) return fail("INVALID_CLOSE_PIN", "确认码必须是4位数字。", 400);
  const closeOrderPinHash = await hashPassword(pin);
  const setting = await prisma.logisticsWorkbenchSetting.upsert({
    where: { businessUnitId: auth.membership.businessUnitId },
    update: { closeOrderPinHash, updatedByUserId: auth.userId },
    create: { businessUnitId: auth.membership.businessUnitId, quickTags: [], cards: [], closeOrderPinHash, updatedByUserId: auth.userId },
  });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "logistics.workbench_setting", action: "shipment.close_pin.update", targetType: "logistics_workbench_setting", targetId: setting.id, businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { configured: true } });
  return ok({ configured: true });
}
