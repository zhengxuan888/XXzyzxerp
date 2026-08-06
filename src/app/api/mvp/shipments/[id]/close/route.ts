import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const ALLOWED_REASONS = new Set(["客户不读不回", "无法派送", "客户拒收", "地址无法确认", "其他"]);

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const body = await request.json().catch(() => null) as { pin?: string; reason?: string; detail?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  const reason = body?.reason?.trim() ?? "";
  const detail = body?.detail?.trim() ?? "";
  if (!/^\d{4}$/.test(pin)) return fail("INVALID_CLOSE_PIN", "请输入4位确认码。", 400);
  if (!ALLOWED_REASONS.has(reason)) return fail("INVALID_CLOSE_REASON", "请选择结束原因。", 400);
  if (reason === "其他" && !detail) return fail("CLOSE_DETAIL_REQUIRED", "请填写具体原因。", 400);

  const shipment = await prisma.shipment.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId }, include: { order: true } });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流订单不存在。", 404);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.track.update", targetBusinessUnitId: shipment.businessUnitId, targetDepartmentId: shipment.order.departmentId, targetSiteId: shipment.siteId, targetUserId: shipment.order.creatorUserId, targetMembershipId: shipment.order.ownedByMembershipId });
  if (!permission.allowed) return fail("FORBIDDEN", "当前角色没有结束订单的权限。", 403);
  if (shipment.status === "CLOSED") return ok({ closed: true });
  const setting = await prisma.logisticsWorkbenchSetting.findUnique({ where: { businessUnitId: shipment.businessUnitId }, select: { closeOrderPinHash: true } });
  if (!setting?.closeOrderPinHash) return fail("CLOSE_PIN_NOT_CONFIGURED", "管理员尚未设置结束订单确认码。", 409);
  if (!await verifyPassword(pin, setting.closeOrderPinHash)) return fail("CLOSE_PIN_INCORRECT", "确认码不正确。", 403);

  const occurredAt = new Date();
  const closeReason = detail ? `${reason}：${detail}`.slice(0, 500) : reason;
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id: shipment.id }, data: { status: "CLOSED", workStatus: "CLOSED", closedAt: occurredAt, closeReason, nextFollowUpAt: null } });
    await tx.order.update({ where: { id: shipment.orderId }, data: { status: "COMPLETED", exceptionNote: `售后结束：${closeReason}` } });
    await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, eventType: "CLOSED_MANUALLY", statusMilestone: "CLOSED", source: "ERP", externalEventKey: `manual-close:${shipment.id}`, occurredAt, memo: `售后结束订单：${closeReason}`, actorMembershipId: auth.membership.id } });
    await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.shipments", action: "shipment.close.manual", targetType: "shipment", targetId: shipment.id, businessUnitId: shipment.businessUnitId, roleId: auth.membership.roleId, details: { orderId: shipment.orderId, reason: closeReason } }, tx);
  });
  return ok({ closed: true, reason: closeReason });
}
