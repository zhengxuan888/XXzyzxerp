import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const ORDER_CAPTURE_ACTIONS = ["order.update", "order.review", "order.ship"] as const;
const MAX_ORIGINAL_ADDRESS_LENGTH = 1000;

type CaptureBody = {
  recipientFullAddress?: unknown;
};

function normalizedOriginalAddress(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ORIGINAL_ADDRESS_LENGTH) return null;
  return normalized;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const body = await request.json().catch(() => null) as CaptureBody | null;
  const recipientFullAddress = normalizedOriginalAddress(body?.recipientFullAddress);
  if (!recipientFullAddress) {
    return fail(
      "INVALID_ORIGINAL_ADDRESS",
      `完整原始地址不能为空，且最多 ${MAX_ORIGINAL_ADDRESS_LENGTH} 个字符。`,
      400,
    );
  }

  const { id } = await props.params;
  const order = await prisma.order.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: {
      id: true,
      orderNo: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      creatorUserId: true,
      ownedByMembershipId: true,
      recipientFullAddress: true,
      shipments: { select: { id: true, siteId: true } },
    },
  });
  if (!order) return fail("ORDER_NOT_FOUND", "订单不存在或无权访问。", 404);

  const basePermissionTarget = {
    userId: auth.userId,
    membershipId: auth.membership.id,
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetUserId: order.creatorUserId,
    targetMembershipId: order.ownedByMembershipId,
  };
  const permissionDecisions = await Promise.all([
    ...ORDER_CAPTURE_ACTIONS.map((actionKey) => checkPermission({
      ...basePermissionTarget,
      actionKey,
      targetSiteId: order.siteId,
    })),
    ...order.shipments.map((shipment) => checkPermission({
      ...basePermissionTarget,
      actionKey: "shipment.track.update",
      targetSiteId: shipment.siteId,
    })),
  ]);
  if (!permissionDecisions.some((decision) => decision.allowed)) {
    return fail("FORBIDDEN", "当前岗位没有补录此订单原始地址的权限。", 403);
  }
  if (order.recipientFullAddress?.trim()) {
    return fail("ORIGINAL_ADDRESS_ALREADY_CAPTURED", "完整原始地址已留存，不允许覆盖。", 409);
  }

  const captured = await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: {
        id: order.id,
        businessUnitId: order.businessUnitId,
        OR: [{ recipientFullAddress: null }, { recipientFullAddress: "" }],
      },
      data: { recipientFullAddress },
    });
    if (result.count !== 1) return false;

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.orders",
      action: "order.original_address.capture",
      targetType: "order",
      targetId: order.id,
      businessUnitId: order.businessUnitId,
      roleId: auth.membership.roleId,
      details: {
        orderNo: order.orderNo,
        characterCount: recipientFullAddress.length,
        source: "manual_one_time_capture",
      },
    }, tx);
    return true;
  });

  if (!captured) {
    return fail("ORIGINAL_ADDRESS_ALREADY_CAPTURED", "完整原始地址已由其他员工留存，请刷新查看。", 409);
  }

  return ok({ orderId: order.id, captured: true });
}
