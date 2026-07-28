import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  HIGH_PRIORITY_SHIPMENT_EVENTS,
  type ShipmentEventType,
  getAlertRuleForShipmentLocation,
  resolveHighPriorityIndex,
  parseShipmentEventPayload,
  pickAlertRuleKeyFromLocation,
  shipmentEventMeta,
  shouldSuppressHighPriorityFollowUp,
} from "@/lib/logistics";
import { fail, ok } from "@/lib/api-response";

function nextFollowUpDate(eventType: keyof typeof shipmentEventMeta, occurredAt: Date) {
  const isHighPriority = shipmentEventMeta[eventType].priority === "HIGH";
  const hours = isHighPriority ? 6 : 24;
  return new Date(occurredAt.getTime() + hours * 60 * 60 * 1000);
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: {
      id: true,
      businessUnitId: true,
      orderId: true,
      status: true,
      workStatus: true,
      firstTrackedAt: true,
      lastTrackedAt: true,
      nextFollowUpAt: true,
      order: {
        select: {
          recipientCountryCode: true,
          recipientRegion: true,
          recipientCity: true,
          recipientAddress: true,
        },
      },
    },
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
    const eventLocationHint = parsed.location
      || shipment.order.recipientCountryCode
      || shipment.order.recipientRegion
      || shipment.order.recipientCity
      || "";
    const locationRule = getAlertRuleForShipmentLocation(eventLocationHint)
      ?? getAlertRuleForShipmentLocation(shipment.order.recipientAddress ?? "");
    const ruleKey = pickAlertRuleKeyFromLocation(eventLocationHint);

    const existingHighPriorityEvents = await tx.shipmentEvent.findMany({
      where: { shipmentId: shipment.id, eventType: { in: HIGH_PRIORITY_SHIPMENT_EVENTS } },
      select: { eventType: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
    const alertContext = resolveHighPriorityIndex(
      existingHighPriorityEvents.map((entry) => ({
        eventType: entry.eventType as ShipmentEventType,
        occurredAt: entry.occurredAt,
      })),
      {
        eventType: parsed.eventType,
        occurredAt: parsed.occurredAt,
      },
    );
    const milestoneCount = locationRule
      ? await tx.shipmentEvent.count({
          where: { shipmentId: shipment.id, eventType: locationRule.milestoneEvent },
        })
      : 0;

    const isMilestoneReached = milestoneCount > 0;
    const isHighPriority = shipmentEventMeta[parsed.eventType].priority === "HIGH";
    const highPriorityIndex = isHighPriority ? alertContext.highPriorityIndex : 0;
    const suppressFollowUp = shouldSuppressHighPriorityFollowUp(parsed.eventType, {
      highPriorityIndex,
      countryRuleName: ruleKey,
      // Only an outstanding, not-yet-due follow-up suppresses a duplicate task.
      // Historical/closed follow-ups must not prevent a new tracking event from
      // creating a new customer-contact task.
      hasActiveHighPriorityFollowUp: Boolean(
        shipment.nextFollowUpAt && shipment.nextFollowUpAt.getTime() > Date.now(),
      ),
      isMilestoneReached,
      firstTrackedAt: shipment.firstTrackedAt,
      lastTrackedAt: shipment.lastTrackedAt,
      occurredAt: parsed.occurredAt,
    });

    const event = await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        eventType: parsed.eventType,
        occurredAt: parsed.occurredAt,
        location: parsed.location,
        memo: parsed.memo,
        actorMembershipId: auth.membership.id,
      },
    });

    const nextWorkStatus = shipmentEventMeta[parsed.eventType].workStatus;
    const nextFollowUpAt = parsed.status === "DELIVERED" || parsed.status === "CANCELLED"
      ? null
      : nextFollowUpDate(parsed.eventType, parsed.occurredAt);

    const updatedShipment = await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: parsed.status,
        workStatus: nextWorkStatus,
        firstTrackedAt: shipment.firstTrackedAt ?? parsed.occurredAt,
        lastTrackedAt: parsed.occurredAt,
        deliveredAt: parsed.status === "DELIVERED" ? parsed.occurredAt : undefined,
        closedAt: parsed.status === "DELIVERED" || parsed.status === "CANCELLED" ? parsed.occurredAt : null,
        exceptionReason: parsed.status === "EXCEPTION" ? parsed.exceptionReason : null,
        exceptionSeverity: parsed.status === "EXCEPTION" ? parsed.exceptionSeverity ?? "MEDIUM" : undefined,
        nextFollowUpAt: suppressFollowUp ? null : nextFollowUpAt,
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
              : parsed.status === "RETURNING" || parsed.status === "RETURNED"
                ? "COMPLETED"
                : null;

      if (nextOrderStatus) {
        await tx.order.update({
          where: { id: shipment.orderId, status: order.status },
          data: {
            status: nextOrderStatus,
            deliveredAt: nextOrderStatus === "DELIVERED" ? parsed.occurredAt : undefined,
            exceptionNote: parsed.exceptionReason ?? null,
          },
        });
      }
    }

    let followUp = null;
    if (!suppressFollowUp && !alertContext.isDuplicate) {
      followUp = await tx.logisticsFollowUp.create({
        data: {
          shipmentId: shipment.id,
          businessUnitId: shipment.businessUnitId,
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          actionType: "TRACKING_EVENT",
          fromStatus: shipment.workStatus,
          toStatus: nextWorkStatus,
          note: parsed.memo ?? parsed.exceptionReason,
          nextFollowUpAt,
        },
      });
    }

    return {
      event,
      shipment: updatedShipment,
      followUp,
      shipmentRule: locationRule ? locationRule.key : null,
      followUpSuppressed: suppressFollowUp,
      alertContext,
    };
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
      followUpCreated: result.followUp !== null,
      shipmentRule: result.shipmentRule,
      followUpSuppressed: result.followUpSuppressed,
    },
  });

  return ok(result, { status: 201 });
}
