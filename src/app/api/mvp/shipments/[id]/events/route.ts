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

  const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true, businessUnitId: true } });
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
    const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: parsed.status,
          deliveredAt: parsed.status === "DELIVERED" ? parsed.occurredAt : undefined,
          exceptionReason: parsed.status === "EXCEPTION" ? parsed.exceptionReason : parsed.status === "CANCELLED" ? null : undefined,
          exceptionSeverity: parsed.status === "EXCEPTION" ? parsed.exceptionSeverity ?? "MEDIUM" : undefined,
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
