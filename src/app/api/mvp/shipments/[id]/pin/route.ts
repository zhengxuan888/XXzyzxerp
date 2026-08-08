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
  const body = await request.json().catch(() => null) as { pinned?: unknown } | null;
  if (typeof body?.pinned !== "boolean") {
    return fail("INVALID_PIN_STATE", "请明确选择锁定或取消锁定。", 400);
  }

  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: {
      id: true,
      businessUnitId: true,
      siteId: true,
      order: { select: { departmentId: true, creatorUserId: true, ownedByMembershipId: true } },
    },
  });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流订单不存在或无权限。", 404);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: shipment.businessUnitId,
    targetDepartmentId: shipment.order.departmentId,
    targetSiteId: shipment.siteId,
    targetUserId: shipment.order.creatorUserId,
    targetMembershipId: shipment.order.ownedByMembershipId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "当前岗位没有查看此物流订单的权限。", 403);

  const result = await prisma.$transaction(async (tx) => {
    const existing = body.pinned
      ? await tx.shipmentCardPin.findUnique({
          where: { membershipId_shipmentId: { membershipId: auth.membership.id, shipmentId: shipment.id } },
          select: { id: true },
        })
      : null;

    const pin = body.pinned
      ? await tx.shipmentCardPin.upsert({
          where: { membershipId_shipmentId: { membershipId: auth.membership.id, shipmentId: shipment.id } },
          create: {
            businessUnitId: shipment.businessUnitId,
            membershipId: auth.membership.id,
            shipmentId: shipment.id,
          },
          update: {},
          select: { pinnedAt: true },
        })
      : null;

    const removed = body.pinned
      ? { count: 0 }
      : await tx.shipmentCardPin.deleteMany({
          where: { membershipId: auth.membership.id, shipmentId: shipment.id },
        });

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.shipments",
      action: body.pinned ? "shipment.card.pin" : "shipment.card.unpin",
      targetType: "shipment",
      targetId: shipment.id,
      businessUnitId: shipment.businessUnitId,
      roleId: auth.membership.roleId,
      details: { pinned: body.pinned, changed: body.pinned ? !existing : removed.count > 0 },
    }, tx);

    return { pinned: body.pinned, pinnedAt: pin?.pinnedAt ?? null };
  });

  return ok({
    shipmentId: shipment.id,
    pinned: result.pinned,
    pinnedAt: result.pinnedAt?.toISOString() ?? null,
  });
}
