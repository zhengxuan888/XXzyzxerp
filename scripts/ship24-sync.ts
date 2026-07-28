import { prisma } from "@/lib/prisma";
import { Ship24Adapter, ship24ConfigFromEnv } from "@/lib/logistics/ship24-adapter";

async function main() {
  const config = ship24ConfigFromEnv();
  if (!config) { console.log("Ship24 disabled or missing key; skip sync."); return; }
  const adapter = new Ship24Adapter(config);
  const shipments = await prisma.shipment.findMany({ where: { trackingNo: { not: null }, status: { in: ["IN_TRANSIT", "PENDING"] } }, select: { id: true, trackingNo: true, carrier: true } });
  let inserted = 0; let failed = 0;
  for (const shipment of shipments) {
    try {
      const result = await adapter.track(shipment.trackingNo!, shipment.carrier ?? undefined);
      for (const event of result.events) {
        const created = await prisma.shipmentEvent.createMany({ data: [{ shipmentId: shipment.id, occurredAt: event.occurredAt, eventType: event.status, statusMilestone: event.status, location: event.location, source: adapter.key, externalEventKey: event.externalEventKey, memo: event.description }], skipDuplicates: true });
        inserted += created.count;
      }
      await prisma.shipment.update({ where: { id: shipment.id }, data: { lastTrackedAt: new Date() } });
    } catch (error) { failed += 1; console.error(`Ship24 sync failed for ${shipment.id}:`, error instanceof Error ? error.message : error); }
  }
  console.log(JSON.stringify({ shipments: shipments.length, inserted, failed, intervalMinutes: Number(process.env.SHIP24_SYNC_INTERVAL_MINUTES || 30) }));
}

main().finally(() => prisma.$disconnect());
