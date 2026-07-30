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
  const canSearchTrackingNo = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.tracking_no.view",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetUserId: auth.userId,
  });

  const pagination = parsePagination(request);
  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const where: Prisma.ShipmentWhereInput = {
    businessUnitId: auth.membership.businessUnitId,
    ...(status ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            ...(canSearchTrackingNo.allowed ? [{ trackingNo: { contains: query, mode: "insensitive" as const } }] : []),
            { carrier: { contains: query, mode: "insensitive" } },
            { order: { orderNo: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.shipment.findMany({
    where,
    include: {
      order: {
        select: {
          orderNo: true,
          departmentId: true,
          creatorUserId: true,
        },
      },
      events: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const scopedRows = (await Promise.all(rows.map(async (row) => {
    const target = {
      userId: auth.userId,
      membershipId: auth.membership.id,
      targetBusinessUnitId: row.businessUnitId,
      targetDepartmentId: row.order.departmentId,
      targetSiteId: row.siteId,
      targetUserId: row.order.creatorUserId,
    };
    const [read, trackingNo, timeline] = await Promise.all([
      checkPermission({ ...target, actionKey: "shipment.read" }),
      checkPermission({ ...target, actionKey: "shipment.tracking_no.view" }),
      checkPermission({ ...target, actionKey: "shipment.timeline.view" }),
    ]);
    if (!read.allowed) return null;
    return {
      ...row,
      order: { orderNo: row.order.orderNo },
      trackingNo: trackingNo.allowed ? row.trackingNo : null,
      events: timeline.allowed ? row.events : [],
    };
  }))).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return paginated(
    scopedRows.slice(pagination.skip, pagination.skip + pagination.take),
    scopedRows.length,
    pagination,
  );
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
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
  });
  if (!canCreate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });
  }

  const trackingNo = typeof body.trackingNo === "string" ? body.trackingNo.trim() : "";
  const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
  if (!trackingNo || !carrier) {
    return fail("SHIPMENT_FIELDS_REQUIRED", "物流商和物流单号必填。", 400);
  }
  const existingPending = await prisma.shipment.findFirst({
    where: { orderId: order.id, businessUnitId: order.businessUnitId, status: "PENDING" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, trackingNo: true, carrier: true },
  });
  const duplicate = await prisma.shipment.findFirst({
    where: {
      businessUnitId: order.businessUnitId,
      trackingNo,
      ...(existingPending ? { NOT: { id: existingPending.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) return fail("TRACKING_NO_ALREADY_EXISTS", "该物流单号已存在。", 409);

  const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 1000) : "";
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const saved = existingPending
        ? await tx.shipment.update({
          where: { id: existingPending.id, status: "PENDING" },
          data: {
            carrier,
            trackingNo,
            memo: memo || null,
            events: {
              create: [{
                eventType: "TRACKING_NUMBER_ASSIGNED",
                statusMilestone: "PENDING",
                source: "MANUAL",
                externalEventKey: `manual-tracking:${existingPending.id}:${trackingNo}`,
                memo: memo || "手工回填物流单号，尚未确认发货。",
                actorMembershipId: auth.membership.id,
              }],
            },
          },
          include: { order: { select: { orderNo: true } }, events: true },
        })
        : await tx.shipment.create({
          data: {
            orderId: order.id,
            legalEntityId: order.legalEntityId,
            businessUnitId: order.businessUnitId,
            siteId: auth.membership.siteId,
            carrier,
            trackingNo,
            status: "PENDING",
            memo: memo || null,
            events: {
              create: [{
                eventType: "TRACKING_NUMBER_ASSIGNED",
                statusMilestone: "PENDING",
                source: "MANUAL",
                memo: memo || "手工回填物流单号，尚未确认发货。",
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
        action: existingPending ? "shipment.tracking.assign" : "shipment.create",
        targetType: "shipment",
        targetId: saved.id,
        businessUnitId: saved.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          orderId: order.id,
          source: "MANUAL",
          reusedPendingShipment: Boolean(existingPending),
          previous: existingPending ? { carrier: existingPending.carrier, trackingNo: existingPending.trackingNo } : null,
          next: { carrier: saved.carrier, trackingNo: saved.trackingNo },
        },
      }, tx);

      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return fail(
        "SHIPMENT_CONCURRENTLY_CHANGED",
        "该订单或物流单号刚刚被其他人处理，请刷新后核对，系统未覆盖原数据。",
        409,
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return fail(
        "SHIPMENT_CONCURRENTLY_CHANGED",
        "待发货记录状态已经变化，请刷新后重新操作。",
        409,
      );
    }
    throw error;
  }

  return ok(row, { status: 201 });
}
