import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.transferred !== "boolean") {
    return fail("INVALID_TRANSFER_STATUS", "请选择已转或未转。", 400);
  }

  const order = await prisma.order.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: {
      id: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      creatorUserId: true,
      ownedByMembershipId: true,
      status: true,
      shopId: true,
      shopWindowTransferredAt: true,
    },
  });
  if (!order) return fail("ORDER_NOT_FOUND", "订单不存在或无权访问。", 404);
  if (order.status !== "WAITING_SHIPMENT") {
    return fail("INVALID_ORDER_STATUS", "只有待发货订单可以修改窗口转移状态。", 409);
  }
  if (!order.shopId) return fail("SHOP_ID_REQUIRED", "该订单未填写窗口 ID。", 409);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.ship",
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
    targetMembershipId: order.ownedByMembershipId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "当前账号无待发货操作权限。", 403);

  const transferredAt = body.transferred ? new Date() : null;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: order.id },
      data: {
        shopWindowTransferredAt: transferredAt,
        shopWindowTransferredByMembershipId: body.transferred ? auth.membership.id : null,
      },
      select: { id: true, shopId: true, shopWindowTransferredAt: true },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "sales.shop_window_transfer",
      action: body.transferred ? "shop_window.mark_transferred" : "shop_window.mark_not_transferred",
      targetType: "order",
      targetId: order.id,
      businessUnitId: order.businessUnitId,
      roleId: auth.membership.roleId,
      details: {
        shopId: order.shopId,
        previousTransferredAt: order.shopWindowTransferredAt?.toISOString() ?? null,
        transferredAt: transferredAt?.toISOString() ?? null,
      },
    }, tx);
    return result;
  });

  return ok(updated);
}
