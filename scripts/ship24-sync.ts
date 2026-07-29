import { prisma } from "@/lib/prisma";
import { Ship24Adapter, ship24ConfigFromEnv } from "@/lib/logistics/ship24-adapter";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { normalizeProviderEventStatus, providerFollowUpAt, shouldApplyProviderStatus } from "@/lib/logistics/provider";

async function main() {
  const config = ship24ConfigFromEnv();
  if (!config) { console.log("Ship24 disabled or missing key; skip sync."); return; }
  const adapter = new Ship24Adapter(config);
  const candidates = await prisma.shipment.findMany({
    where: {
      trackingNo: { not: null },
      status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "EXCEPTION", "RETURNING"] },
    },
    select: { id: true, businessUnitId: true, trackingNo: true, carrier: true, lastTrackedAt: true, status: true },
  });
  const settings = await prisma.logisticsWorkbenchSetting.findMany();
  const configByBusinessUnit = new Map(settings.map((setting) => [setting.businessUnitId, parseLogisticsWorkbenchConfig(setting)]));
  const now = Date.now();
  const shipments = candidates.filter((shipment) => {
    const interval = configByBusinessUnit.get(shipment.businessUnitId)?.syncIntervalMinutes ?? 30;
    return !shipment.lastTrackedAt || now - shipment.lastTrackedAt.getTime() >= interval * 60_000;
  });
  let inserted = 0; let failed = 0;
  for (const shipment of shipments) {
    try {
      let currentStatus = shipment.status;
      const result = await adapter.track(shipment.trackingNo!, shipment.carrier ?? undefined);
      for (const event of result.events) {
        const normalized = normalizeProviderEventStatus(event.status);
        if (!normalized) continue;
        const created = await prisma.shipmentEvent.createMany({ data: [{ shipmentId: shipment.id, occurredAt: event.occurredAt, eventType: normalized.eventType, statusMilestone: normalized.status, location: event.location, source: adapter.key, externalEventKey: event.externalEventKey, memo: event.description }], skipDuplicates: true });
        inserted += created.count;
        if (created.count && shouldApplyProviderStatus(currentStatus, normalized.status)) {
          await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
              status: normalized.status,
              workStatus: normalized.workStatus,
              nextFollowUpAt: providerFollowUpAt(event.status, event.occurredAt),
              deliveredAt: normalized.status === "DELIVERED" ? event.occurredAt : undefined,
              closedAt: normalized.status === "DELIVERED" || normalized.status === "CANCELLED" ? event.occurredAt : null,
            },
          });
          currentStatus = normalized.status;
        }
      }
      await prisma.shipment.update({ where: { id: shipment.id }, data: { lastTrackedAt: new Date() } });
    } catch (error) { failed += 1; console.error(`Ship24 sync failed for ${shipment.id}:`, error instanceof Error ? error.message : error); }
  }
  console.log(JSON.stringify({ candidates: candidates.length, dueShipments: shipments.length, inserted, failed, intervalSource: "business_unit_database_setting" }));
}

main().finally(() => prisma.$disconnect());
