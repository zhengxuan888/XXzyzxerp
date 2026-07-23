import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const row = await prisma.order.findUnique({ where: { id } });
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
  });
  if (!canDelete.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });

  await prisma.order.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: "order.delete",
    targetType: "order",
    targetId: id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
  });

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

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.read",
    targetBusinessUnitId: row.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  return NextResponse.json(row);
}
