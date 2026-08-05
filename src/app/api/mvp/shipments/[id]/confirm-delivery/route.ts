import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

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
  if (!permission.allowed) return fail("FORBIDDEN", "当前角色没有人工确认签收的权限。", 403);
  if (shipment.status !== "DELIVERED") return fail("PROVIDER_DELIVERY_REQUIRED", "物流尚未显示签收，暂不能人工确认。", 409);
  if (shipment.order.exceptionNote === "签收后退款") return fail("ALREADY_REFUNDED", "该订单已登记签收退款。", 409);
  if (shipment.order.exceptionNote === CONFIRMED_NOTE) return ok({ orderId: shipment.orderId, result: CONFIRMED_NOTE });

  const occurredAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: shipment.orderId },
      data: { status: "DELIVERED", exceptionNote: CONFIRMED_NOTE, deliveredAt: shipment.order.deliveredAt ?? occurredAt },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        eventType: "DELIVERED",
        statusMilestone: "DELIVERED",
        source: "ERP",
        externalEventKey: `manual-delivery-confirm:${shipment.id}`,
        occurredAt,
        memo: CONFIRMED_NOTE,
        actorMembershipId: auth.membership.id,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.shipments",
      action: "shipment.delivery.confirm_manual",
      targetType: "shipment",
      targetId: shipment.id,
      businessUnitId: shipment.businessUnitId,
      roleId: auth.membership.roleId,
      details: { orderId: shipment.orderId, result: CONFIRMED_NOTE },
    }, tx);
  });

  return ok({ orderId: shipment.orderId, result: CONFIRMED_NOTE });
}
