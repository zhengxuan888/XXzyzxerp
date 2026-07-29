import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeProviderEventStatus, providerFollowUpAt, shouldApplyProviderStatus } from "@/lib/logistics/provider";

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
  const created = await prisma.shipmentEvent.createMany({
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
  if (!created.count) return NextResponse.json({ ok: true, duplicate: true });

  const newerEventCount = await prisma.shipmentEvent.count({
    where: { shipmentId: shipment.id, occurredAt: { gt: safeOccurredAt } },
  });
  const isLatest = newerEventCount === 0 && shouldApplyProviderStatus(shipment.status, normalized.status);
  await prisma.shipment.update({
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
  return NextResponse.json({ ok: true, eventKey, stateUpdated: isLatest });
}
