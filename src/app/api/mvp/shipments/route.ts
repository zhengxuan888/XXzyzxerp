import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { Prisma } from "@prisma/client";

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

  const [canViewTrackingNo, canViewTimeline] = await Promise.all([
    checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.tracking_no.view", targetBusinessUnitId: auth.membership.businessUnitId }),
    checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.timeline.view", targetBusinessUnitId: auth.membership.businessUnitId }),
  ]);

  const pagination = parsePagination(request);
  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const where: Prisma.ShipmentWhereInput = {
    businessUnitId: auth.membership.businessUnitId,
    ...(status ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            ...(canViewTrackingNo.allowed ? [{ trackingNo: { contains: query, mode: "insensitive" as const } }] : []),
            { carrier: { contains: query, mode: "insensitive" } },
            { order: { orderNo: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
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
  const safeRows = rows.map((row) => ({
    ...row,
    trackingNo: canViewTrackingNo.allowed ? row.trackingNo : null,
    events: canViewTimeline.allowed ? row.events : [],
  }));
  return paginated(safeRows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.orderId !== "string") {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: body.orderId, businessUnitId: auth.membership.businessUnitId },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "WAITING_SHIPMENT") {
    return fail("ORDER_NOT_READY_TO_SHIP", "只有核单通过并进入待发货状态的订单才能回填物流单号。", 409);
  }

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: order.businessUnitId,
  });
  if (!canCreate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });
  }

  const trackingNo = typeof body.trackingNo === "string" ? body.trackingNo.trim() : "";
  const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
  if (!trackingNo || !carrier) {
    return fail("SHIPMENT_FIELDS_REQUIRED", "物流商和物流单号必填。", 400);
  }
  const duplicate = await prisma.shipment.findFirst({
    where: { businessUnitId: order.businessUnitId, trackingNo },
    select: { id: true },
  });
  if (duplicate) return fail("TRACKING_NO_ALREADY_EXISTS", "该物流单号已存在。", 409);

  const row = await prisma.shipment.create({
    data: {
      orderId: order.id,
      legalEntityId: order.legalEntityId,
      businessUnitId: order.businessUnitId,
      siteId: auth.membership.siteId,
      carrier,
      trackingNo,
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
