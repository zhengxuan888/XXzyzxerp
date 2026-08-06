import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api-response";
import { DemoTrackingAdapter } from "@/lib/logistics/ship24-adapter";
import { normalizeProviderEventStatus, providerFollowUpAt, ProviderConfigurationError, shouldApplyProviderStatus } from "@/lib/logistics/provider";
import { Ship24Adapter } from "@/lib/logistics/ship24-adapter";
import { getShip24Credential } from "@/lib/integration-credentials";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { queueLogisticsNotification } from "@/lib/notifications/logistics-delivery";
import { translateAndCacheTrackingText } from "@/lib/tracking-translation-service";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { order: { select: { departmentId: true, creatorUserId: true, ownedByMembershipId: true } } },
  });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流订单不存在或无权限。", 404);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: shipment.businessUnitId,
    targetDepartmentId: shipment.order.departmentId,
    targetSiteId: shipment.siteId,
    targetUserId: shipment.order.creatorUserId,
    targetMembershipId: shipment.order.ownedByMembershipId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有同步物流轨迹的权限。", 403);
  if (shipment.status === "CLOSED") return fail("SHIPMENT_CLOSED", "订单已由售后结束，不再同步物流轨迹。", 409);
  if (!shipment.trackingNo) return fail("TRACKING_NO_REQUIRED", "请先填写物流单号。", 409);

  const body = await request.json().catch(() => null) as { provider?: string } | null;
  try {
    const adapter = body?.provider === "DEMO" && process.env.NODE_ENV !== "production"
      ? new DemoTrackingAdapter()
      : await getShip24Credential(shipment.businessUnitId).then((config) => {
          if (!config) throw new ProviderConfigurationError("Ship24 未启用或缺少 API Key。");
          return new Ship24Adapter({ ...config, enabled: true });
        });
    const result = await adapter.track(shipment.trackingNo, shipment.carrier ?? undefined);
    await Promise.allSettled(result.events.map((event) => translateAndCacheTrackingText(shipment.businessUnitId, event.description)));
    const workbenchSetting = await prisma.logisticsWorkbenchSetting.findUnique({
      where: { businessUnitId: shipment.businessUnitId },
    });
    const syncResult = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      let ignoredUnknown = 0;
      let notificationQueued = 0;
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
            actorMembershipId: auth.membership.id,
          }],
          skipDuplicates: true,
        });
        if (!created.count) continue;
        inserted += 1;
        insertedEvents.push({ occurredAt: event.occurredAt, rawStatus: event.status, normalized });
        const notification = await queueLogisticsNotification({
          businessUnitId: shipment.businessUnitId,
          shipmentId: shipment.id,
          source: adapter.key,
          externalEventKey: event.externalEventKey,
          eventType: normalized.eventType,
          priority: normalized.priority,
          config: parseLogisticsWorkbenchConfig(workbenchSetting),
        }, tx);
        if (notification.queued) notificationQueued += 1;
      }

      const latestInserted = insertedEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
      const currentShipment = await tx.shipment.findUnique({
        where: { id: shipment.id },
        select: { status: true, firstTrackedAt: true, orderId: true },
      });
      if (!currentShipment) throw new Error("SHIPMENT_DISAPPEARED");
      const newerEventCount = latestInserted
        ? await tx.shipmentEvent.count({
            where: { shipmentId: shipment.id, occurredAt: { gt: latestInserted.occurredAt } },
          })
        : 0;
      const stateUpdated = Boolean(
        latestInserted
        && newerEventCount === 0
        && shouldApplyProviderStatus(currentShipment.status, latestInserted.normalized.status),
      );
      await tx.shipment.update({
        where: { id: shipment.id },
        data: stateUpdated && latestInserted
          ? {
              status: latestInserted.normalized.status,
              workStatus: latestInserted.normalized.workStatus,
              firstTrackedAt: currentShipment.firstTrackedAt ?? latestInserted.occurredAt,
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
          where: { id: currentShipment.orderId },
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
            where: { id: currentShipment.orderId, status: currentOrder.status },
            data: {
              status: nextOrderStatus,
              deliveredAt: nextOrderStatus === "DELIVERED" ? latestInserted.occurredAt : undefined,
              exceptionNote: nextOrderStatus === "EXCEPTION" ? latestInserted.rawStatus : null,
            },
          });
        }
      }

      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "logistics.provider_sync",
        action: "shipment.track.sync",
        targetType: "shipment",
        targetId: shipment.id,
        businessUnitId: shipment.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          provider: adapter.key,
          received: result.events.length,
          inserted,
          ignoredUnknown,
          notificationQueued,
          stateUpdated,
        },
      }, tx);
      return { inserted, ignoredUnknown, notificationQueued, stateUpdated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok({ provider: adapter.key, received: result.events.length, ...syncResult, trackingNo: result.trackingNo });
  } catch (error) {
    if (error instanceof ProviderConfigurationError) return fail("PROVIDER_NOT_CONFIGURED", error.message, 503);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("TRACKING_SYNC_RETRY_REQUIRED", "物流状态刚刚发生变化，请重新同步。", 409);
    }
    return fail("TRACKING_SYNC_FAILED", error instanceof Error ? error.message : "物流同步失败。", 502);
  }
}
