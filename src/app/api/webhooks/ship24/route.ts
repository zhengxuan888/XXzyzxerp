import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeProviderEventStatus, providerFollowUpAt, shouldApplyProviderStatus } from "@/lib/logistics/provider";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { queueLogisticsNotification } from "@/lib/notifications/logistics-delivery";

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.SHIP24_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = signature.replace(/^sha256=/, "");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-ship24-signature"))) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 }); }
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const trackingNo = String(data.trackingNumber ?? data.trackingNo ?? data.tracking_number ?? "").trim();
  const eventKey = String(data.eventId ?? data.id ?? payload.eventId ?? "").trim();
  const status = String(data.statusMilestone ?? data.status ?? "UNKNOWN").toUpperCase();
  if (!trackingNo || !eventKey) return NextResponse.json({ ok: false, error: "trackingNumber and event id are required." }, { status: 400 });
  const shipment = await prisma.shipment.findFirst({ where: { trackingNo, status: { not: "PENDING" } }, select: { id: true, businessUnitId: true, status: true } });
  if (!shipment) return NextResponse.json({ ok: true, ignored: true });
  const normalized = normalizeProviderEventStatus(status);
  if (!normalized) return NextResponse.json({ ok: true, ignored: true, reason: "UNKNOWN_STATUS" });
  const occurredAt = new Date(String(data.dateTime ?? data.datetime ?? new Date().toISOString()));
  const safeOccurredAt = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
  const workbenchSetting = await prisma.logisticsWorkbenchSetting.findUnique({
    where: { businessUnitId: shipment.businessUnitId },
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.shipmentEvent.createMany({
        data: [{
          shipmentId: shipment.id,
          source: "SHIP24_WEBHOOK",
          externalEventKey: eventKey,
          eventType: normalized.eventType,
          statusMilestone: normalized.status,
          location: typeof data.location === "string" ? data.location : null,
          memo: typeof data.description === "string" ? data.description : null,
          occurredAt: safeOccurredAt,
        }],
        skipDuplicates: true,
      });
      if (!created.count) return { duplicate: true, stateUpdated: false, notificationQueued: false };

      const currentShipment = await tx.shipment.findUnique({
        where: { id: shipment.id },
        select: { status: true, orderId: true },
      });
      if (!currentShipment) throw new Error("SHIPMENT_DISAPPEARED");

      const notification = await queueLogisticsNotification({
        businessUnitId: shipment.businessUnitId,
        shipmentId: shipment.id,
        source: "SHIP24_WEBHOOK",
        externalEventKey: eventKey,
        eventType: normalized.eventType,
        priority: normalized.priority,
        config: parseLogisticsWorkbenchConfig(workbenchSetting),
      }, tx);

      const newerEventCount = await tx.shipmentEvent.count({
        where: { shipmentId: shipment.id, occurredAt: { gt: safeOccurredAt } },
      });
      const isLatest = newerEventCount === 0 && shouldApplyProviderStatus(currentShipment.status, normalized.status);
      await tx.shipment.update({
        where: { id: shipment.id },
        data: isLatest
          ? {
              status: normalized.status,
              workStatus: normalized.workStatus,
              nextFollowUpAt: providerFollowUpAt(status, safeOccurredAt),
              lastTrackedAt: new Date(),
              deliveredAt: normalized.status === "DELIVERED" ? safeOccurredAt : undefined,
              closedAt: normalized.status === "DELIVERED" || normalized.status === "CANCELLED" ? safeOccurredAt : null,
            }
          : { lastTrackedAt: new Date() },
      });

      if (isLatest) {
        const currentOrder = await tx.order.findUnique({
          where: { id: currentShipment.orderId },
          select: { status: true },
        });
        const nextOrderStatus = normalized.status === "DELIVERED"
          ? "DELIVERED"
          : normalized.status === "EXCEPTION"
            ? "EXCEPTION"
            : ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(normalized.status)
              && currentOrder?.status === "EXCEPTION"
              ? "SHIPPED"
              : null;
        if (currentOrder && nextOrderStatus) {
          await tx.order.update({
            where: { id: currentShipment.orderId, status: currentOrder.status },
            data: {
              status: nextOrderStatus,
              deliveredAt: nextOrderStatus === "DELIVERED" ? safeOccurredAt : undefined,
              exceptionNote: nextOrderStatus === "EXCEPTION"
                ? (typeof data.description === "string" ? data.description.slice(0, 1000) : status)
                : null,
            },
          });
        }
      }

      await writeAuditLog({
        module: "logistics.ship24_webhook",
        action: "shipment.track.provider_update",
        targetType: "shipment_event",
        targetId: eventKey,
        businessUnitId: shipment.businessUnitId,
        details: {
          shipmentId: shipment.id,
          source: "SHIP24_WEBHOOK",
          externalEventKey: eventKey,
          eventType: normalized.eventType,
          stateUpdated: isLatest,
          notificationQueued: notification.queued,
        },
      }, tx);

      return { duplicate: false, stateUpdated: isLatest, notificationQueued: notification.queued };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, eventKey, ...result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ ok: false, error: "Concurrent update, please retry." }, { status: 503 });
    }
    throw error;
  }
}
