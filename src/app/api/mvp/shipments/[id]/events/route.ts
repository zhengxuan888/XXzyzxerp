import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { parseShipmentEventPayload } from "@/lib/logistics";
import { fail, ok } from "@/lib/api-response";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, businessUnitId: true, orderId: true, status: true, workStatus: true, firstTrackedAt: true },
  });
  if (!shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  const canTrack = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: shipment.businessUnitId,
  });
  if (!canTrack.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canTrack.reasons }, { status: 403 });

  const body = await request.json().catch(() => null);
  let parsed;
  try {
    parsed = parseShipmentEventPayload(body);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "INVALID_SHIPMENT_EVENT", "Invalid shipment event payload.", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        eventType: parsed.eventType,
        occurredAt: parsed.occurredAt,
        memo: parsed.memo,
        actorMembershipId: auth.membership.id,
      },
    });
    const workStatus =
      parsed.status === "EXCEPTION"
        ? "NEEDS_ATTENTION"
        : parsed.status === "DELIVERED" || parsed.status === "CANCELLED"
          ? "CLOSED"
          : "MONITORING";
    const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: parsed.status,
          workStatus,
          firstTrackedAt: shipment.firstTrackedAt ?? parsed.occurredAt,
          lastTrackedAt: parsed.occurredAt,
          deliveredAt: parsed.status === "DELIVERED" ? parsed.occurredAt : undefined,
          closedAt: parsed.status === "DELIVERED" || parsed.status === "CANCELLED" ? parsed.occurredAt : null,
          exceptionReason: parsed.status === "EXCEPTION" ? parsed.exceptionReason : parsed.status === "CANCELLED" ? null : undefined,
          exceptionSeverity: parsed.status === "EXCEPTION" ? parsed.exceptionSeverity ?? "MEDIUM" : undefined,
          nextFollowUpAt:
            parsed.status === "DELIVERED" || parsed.status === "CANCELLED"
              ? null
              : new Date(parsed.occurredAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    const order = await tx.order.findUnique({ where: { id: shipment.orderId }, select: { status: true } });
    if (order) {
      const nextOrderStatus =
        parsed.status === "DELIVERED"
          ? "DELIVERED"
          : parsed.status === "EXCEPTION"
            ? "EXCEPTION"
            : parsed.status === "IN_TRANSIT" && order.status === "EXCEPTION"
              ? "SHIPPED"
              : null;
      if (nextOrderStatus) {
        await tx.order.update({
          where: { id: shipment.orderId, status: order.status },
          data: {
            status: nextOrderStatus,
            deliveredAt: nextOrderStatus === "DELIVERED" ? parsed.occurredAt : undefined,
            exceptionNote: nextOrderStatus === "EXCEPTION" ? parsed.exceptionReason : nextOrderStatus === "SHIPPED" ? null : undefined,
          },
        });
      }
    }
    await tx.logisticsFollowUp.create({
      data: {
        shipmentId: shipment.id,
        businessUnitId: shipment.businessUnitId,
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        actionType: "TRACKING_EVENT",
        fromStatus: shipment.workStatus,
        toStatus: workStatus,
        note: parsed.memo ?? parsed.exceptionReason,
        nextFollowUpAt: updatedShipment.nextFollowUpAt,
      },
    });
    return { event, shipment: updatedShipment };
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.shipments",
    action: "shipment.track.update",
    targetType: "shipment_event",
    targetId: result.event.id,
    businessUnitId: shipment.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      shipmentId: shipment.id,
      eventType: parsed.eventType,
      occurredAt: parsed.occurredAt.toISOString(),
      exceptionSeverity: parsed.exceptionSeverity,
    },
  });

  return ok(result, { status: 201 });
}
