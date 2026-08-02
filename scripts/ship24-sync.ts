import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { Ship24Adapter } from "@/lib/logistics/ship24-adapter";
import { getShip24Credential } from "@/lib/integration-credentials";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { normalizeProviderEventStatus, providerFollowUpAt, shouldApplyProviderStatus } from "@/lib/logistics/provider";
import { queueLogisticsNotification } from "@/lib/notifications/logistics-delivery";

async function main() {
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
  const adapters = new Map<string, Ship24Adapter | null>();
  for (const shipment of shipments) {
    try {
      if (!adapters.has(shipment.businessUnitId)) {
        const config = await getShip24Credential(shipment.businessUnitId);
        adapters.set(shipment.businessUnitId, config ? new Ship24Adapter({ ...config, enabled: true }) : null);
      }
      const adapter = adapters.get(shipment.businessUnitId);
      if (!adapter) continue;
      const result = await adapter.track(shipment.trackingNo!, shipment.carrier ?? undefined);
      const shipmentResult = await prisma.$transaction(async (tx) => {
        let shipmentInserted = 0;
        let notificationQueued = 0;
        let ignoredUnknown = 0;
        const insertedEvents: Array<{
          occurredAt: Date;
          rawStatus: string;
          normalized: NonNullable<ReturnType<typeof normalizeProviderEventStatus>>;
        }> = [];
        for (const event of result.events) {
          const normalized = normalizeProviderEventStatus(event.status);
          if (!normalized) {
            ignoredUnknown += 1;
            continue;
          }
          const created = await tx.shipmentEvent.createMany({
            data: [{
              shipmentId: shipment.id,
              occurredAt: event.occurredAt,
              eventType: normalized.eventType,
              statusMilestone: normalized.status,
              location: event.location,
              source: adapter.key,
              externalEventKey: event.externalEventKey,
              memo: event.description,
            }],
            skipDuplicates: true,
          });
          if (!created.count) continue;
          shipmentInserted += 1;
          insertedEvents.push({ occurredAt: event.occurredAt, rawStatus: event.status, normalized });
          const notification = await queueLogisticsNotification({
            businessUnitId: shipment.businessUnitId,
            shipmentId: shipment.id,
            source: adapter.key,
            externalEventKey: event.externalEventKey,
            eventType: normalized.eventType,
            priority: normalized.priority,
            config: configByBusinessUnit.get(shipment.businessUnitId) ?? parseLogisticsWorkbenchConfig(null),
          }, tx);
          if (notification.queued) notificationQueued += 1;
        }

        const latestInserted = insertedEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
        const current = await tx.shipment.findUnique({
          where: { id: shipment.id },
          select: { status: true, firstTrackedAt: true, orderId: true },
        });
        if (!current) throw new Error("SHIPMENT_DISAPPEARED");
        const newerEventCount = latestInserted
          ? await tx.shipmentEvent.count({
              where: { shipmentId: shipment.id, occurredAt: { gt: latestInserted.occurredAt } },
            })
          : 0;
        const stateUpdated = Boolean(
          latestInserted
          && newerEventCount === 0
          && shouldApplyProviderStatus(current.status, latestInserted.normalized.status),
        );
        await tx.shipment.update({
          where: { id: shipment.id },
          data: stateUpdated && latestInserted
            ? {
                status: latestInserted.normalized.status,
                workStatus: latestInserted.normalized.workStatus,
                firstTrackedAt: current.firstTrackedAt ?? latestInserted.occurredAt,
                lastTrackedAt: new Date(),
                nextFollowUpAt: providerFollowUpAt(latestInserted.rawStatus, latestInserted.occurredAt),
                deliveredAt: latestInserted.normalized.status === "DELIVERED" ? latestInserted.occurredAt : undefined,
                closedAt: latestInserted.normalized.status === "DELIVERED" || latestInserted.normalized.status === "CANCELLED"
                  ? latestInserted.occurredAt
                  : null,
              }
            : { lastTrackedAt: new Date() },
        });

        if (stateUpdated && latestInserted) {
          const currentOrder = await tx.order.findUnique({
            where: { id: current.orderId },
            select: { status: true },
          });
          const nextOrderStatus = latestInserted.normalized.status === "DELIVERED"
            ? "DELIVERED"
            : latestInserted.normalized.status === "EXCEPTION"
              ? "EXCEPTION"
              : ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(latestInserted.normalized.status)
                && currentOrder?.status === "EXCEPTION"
                ? "SHIPPED"
                : null;
          if (currentOrder && nextOrderStatus) {
            await tx.order.update({
              where: { id: current.orderId, status: currentOrder.status },
              data: {
                status: nextOrderStatus,
                deliveredAt: nextOrderStatus === "DELIVERED" ? latestInserted.occurredAt : undefined,
                exceptionNote: nextOrderStatus === "EXCEPTION" ? latestInserted.rawStatus : null,
              },
            });
          }
        }

        await writeAuditLog({
          module: "logistics.scheduled_sync",
          action: "shipment.track.scheduled_sync",
          targetType: "shipment",
          targetId: shipment.id,
          businessUnitId: shipment.businessUnitId,
          details: {
            provider: adapter.key,
            received: result.events.length,
            inserted: shipmentInserted,
            ignoredUnknown,
            notificationQueued,
            stateUpdated,
          },
        }, tx);
        return shipmentInserted;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      inserted += shipmentResult;
    } catch (error) { failed += 1; console.error(`Ship24 sync failed for ${shipment.id}:`, error instanceof Error ? error.message : error); }
  }
  console.log(JSON.stringify({ candidates: candidates.length, dueShipments: shipments.length, inserted, failed, intervalSource: "business_unit_database_setting" }));
}

main().finally(() => prisma.$disconnect());
