import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { ok, paginated, parsePagination } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  const canSeeAll = canRead.reasons.includes("SCOPE_ALL") || canRead.reasons.includes("SCOPE_ALL_OK");
  const pagination = parsePagination(request);
  const where = canSeeAll ? {} : { businessUnitId: auth.membership.businessUnitId };
  const [rows, total] = await prisma.$transaction([
    prisma.shipment.findMany({
      where,
      include: { order: { select: { orderNo: true } }, events: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.shipment.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.orderId !== "string") {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: body.orderId } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: order.businessUnitId,
  });
  if (!canCreate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });
  }

  const row = await prisma.shipment.create({
    data: {
      orderId: order.id,
      legalEntityId: order.legalEntityId,
      businessUnitId: order.businessUnitId,
      siteId: auth.membership.siteId,
      carrier: typeof body.carrier === "string" ? body.carrier : null,
      trackingNo: typeof body.trackingNo === "string" ? body.trackingNo : null,
      status: "PENDING",
      memo: typeof body.memo === "string" ? body.memo : null,
      events: {
        create: [{
          eventType: "SHIPMENT_CREATED",
          memo: typeof body.memo === "string" ? body.memo : "Shipment created.",
          actorMembershipId: auth.membership.id,
        }],
      },
    },
    include: { order: { select: { orderNo: true } }, events: true },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.shipments",
    action: "shipment.create",
    targetType: "shipment",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { orderId: order.id, trackingNo: row.trackingNo },
  });

  return ok(row, { status: 201 });
}
