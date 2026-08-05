import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const REFUND_NOTE = "签收后退款";
const CONFIRMED_NOTE = "人工确认成功签收";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { order: true },
  });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流记录不存在。", 404);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: shipment.businessUnitId,
    targetDepartmentId: shipment.order.departmentId,
    targetSiteId: shipment.siteId,
    targetUserId: shipment.order.creatorUserId,
    targetMembershipId: shipment.order.ownedByMembershipId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "当前角色没有登记签收后退款的权限。", 403);
  if (shipment.order.exceptionNote === REFUND_NOTE) return ok({ orderId: shipment.orderId, status: "COMPLETED", result: REFUND_NOTE });
  if (shipment.status !== "DELIVERED" || shipment.order.exceptionNote !== CONFIRMED_NOTE) return fail("DELIVERY_REQUIRED", "只有人工确认成功签收的订单才能登记签收退款。", 409);

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const occurredAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: shipment.orderId },
      data: { status: "COMPLETED", exceptionNote: REFUND_NOTE, note: note || undefined },
      select: { id: true, status: true },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        eventType: "DELIVERED",
        statusMilestone: "DELIVERED",
        source: "ERP",
        externalEventKey: `manual-after-delivery-refund:${shipment.id}`,
        occurredAt,
        memo: note ? `${REFUND_NOTE}：${note}` : REFUND_NOTE,
        actorMembershipId: auth.membership.id,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.shipments",
      action: "shipment.after_delivery_refund",
      targetType: "shipment",
      targetId: shipment.id,
      businessUnitId: shipment.businessUnitId,
      roleId: auth.membership.roleId,
      details: { orderId: shipment.orderId, result: REFUND_NOTE, note: note || null },
    }, tx);
    return order;
  });

  return ok({ orderId: result.id, status: result.status, result: REFUND_NOTE });
}
