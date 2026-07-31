import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { assertOrderReadScope } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const row = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNo: true,
      status: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      creatorUserId: true,
      ownedByMembershipId: true,
    },
  });
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (row.businessUnitId !== auth.membership.businessUnitId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (row.status !== "DRAFT") {
    return NextResponse.json(
      { ok: false, error: { code: "ORDER_DELETE_NOT_ALLOWED", message: "只有草稿订单可以删除；已进入流程的订单必须取消并保留审计记录。" } },
      { status: 409 },
    );
  }

  const canDelete = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.delete",
    targetBusinessUnitId: row.businessUnitId,
    targetDepartmentId: row.departmentId,
    targetSiteId: row.siteId,
    targetUserId: row.creatorUserId,
    targetMembershipId: row.ownedByMembershipId,
  });
  if (!canDelete.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.order.deleteMany({
      where: {
        id,
        businessUnitId: row.businessUnitId,
        status: "DRAFT",
      },
    });
    if (result.count !== 1) return false;

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.orders",
      action: "order.delete",
      targetType: "order",
      targetId: id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: {
        orderNo: row.orderNo,
        previousStatus: row.status,
        creatorUserId: row.creatorUserId,
        ownedByMembershipId: row.ownedByMembershipId,
      },
    }, tx);
    return true;
  });
  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: { code: "ORDER_DELETE_CONFLICT", message: "订单状态已变化，请刷新后重试。" } },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, deleted: id });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const row = await prisma.order.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: {
      customer: true,
      creatorUser: { select: { username: true, fullName: true } },
      ownerMembership: true,
      items: {
        include: {
          product: { select: { code: true, name: true } },
          sku: { select: { code: true, barcode: true } },
        },
      },
      shipments: { include: { events: { orderBy: { occurredAt: "desc" } } } },
      expenses: true,
      legalEntity: { select: { code: true, name: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const canRead = await assertOrderReadScope({
    membership: auth.membership,
    orderId: row.id,
  });
  if (!canRead) return NextResponse.json({ error: "FORBIDDEN", reasons: ["ORDER_READ_SCOPE_DENIED"] }, { status: 403 });

  const safeShipments = await Promise.all(row.shipments.map(async (shipment) => {
    const target = {
      userId: auth.userId,
      membershipId: auth.membership.id,
      targetBusinessUnitId: row.businessUnitId,
      targetDepartmentId: row.departmentId,
      targetSiteId: shipment.siteId,
      targetUserId: row.creatorUserId,
      targetMembershipId: row.ownedByMembershipId,
    };
    const [trackingNo, timeline] = await Promise.all([
      checkPermission({ ...target, actionKey: "shipment.tracking_no.view" }),
      checkPermission({ ...target, actionKey: "shipment.timeline.view" }),
    ]);
    return {
      ...shipment,
      trackingNo: trackingNo.allowed ? shipment.trackingNo : null,
      events: timeline.allowed ? shipment.events : [],
    };
  }));

  return NextResponse.json({ ...row, shipments: safeShipments });
}
