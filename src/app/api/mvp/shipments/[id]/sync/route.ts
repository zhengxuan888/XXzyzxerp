import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api-response";
import { DemoTrackingAdapter } from "@/lib/logistics/ship24-adapter";
import { ProviderConfigurationError } from "@/lib/logistics/provider";
import { Ship24Adapter, ship24ConfigFromEnv } from "@/lib/logistics/ship24-adapter";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const shipment = await prisma.shipment.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流订单不存在或无权限。", 404);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: shipment.businessUnitId,
    targetSiteId: shipment.siteId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有同步物流轨迹的权限。", 403);
  if (!shipment.trackingNo) return fail("TRACKING_NO_REQUIRED", "请先填写物流单号。", 409);

  const body = await request.json().catch(() => null) as { provider?: string } | null;
  const adapter = body?.provider === "DEMO"
    ? new DemoTrackingAdapter()
    : (() => {
        const config = ship24ConfigFromEnv();
        if (!config) throw new ProviderConfigurationError("Ship24 未启用或缺少 API Key。");
        return new Ship24Adapter(config);
      })();

  try {
    const result = await adapter.track(shipment.trackingNo, shipment.carrier ?? undefined);
    const created = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      for (const event of result.events) {
        const existing = await tx.shipmentEvent.findUnique({ where: { shipmentId_source_externalEventKey: { shipmentId: shipment.id, source: adapter.key, externalEventKey: event.externalEventKey } }, select: { id: true } });
        if (existing) continue;
        await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, occurredAt: event.occurredAt, eventType: event.status, statusMilestone: event.status, location: event.location, source: adapter.key, externalEventKey: event.externalEventKey, memo: event.description, actorMembershipId: auth.membership.id } });
        inserted += 1;
      }
      await tx.shipment.update({ where: { id: shipment.id }, data: { lastTrackedAt: new Date(), firstTrackedAt: shipment.firstTrackedAt ?? new Date() } });
      return inserted;
    });
    return ok({ provider: adapter.key, received: result.events.length, inserted: created, trackingNo: result.trackingNo });
  } catch (error) {
    if (error instanceof ProviderConfigurationError) return fail("PROVIDER_NOT_CONFIGURED", error.message, 503);
    return fail("TRACKING_SYNC_FAILED", error instanceof Error ? error.message : "物流同步失败。", 502);
  }
}
