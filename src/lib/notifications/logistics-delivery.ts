import type { LogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { prisma } from "@/lib/prisma";

export type LogisticsNotificationPriority = "HIGH" | "NORMAL";

export function shouldQueueLogisticsNotification(
  config: Pick<LogisticsWorkbenchConfig, "feishuNotificationsEnabled" | "feishuHighPriorityOnly">,
  priority: LogisticsNotificationPriority,
) {
  return config.feishuNotificationsEnabled && (!config.feishuHighPriorityOnly || priority === "HIGH");
}

export async function queueLogisticsNotification(input: {
  businessUnitId: string;
  shipmentId: string;
  source: string;
  externalEventKey: string;
  eventType: string;
  priority: LogisticsNotificationPriority;
  config: Pick<LogisticsWorkbenchConfig, "feishuNotificationsEnabled" | "feishuHighPriorityOnly">;
}) {
  if (!shouldQueueLogisticsNotification(input.config, input.priority)) return { queued: false, reason: "DISABLED_OR_FILTERED" };
  const shipmentEvent = await prisma.shipmentEvent.findUnique({
    where: {
      shipmentId_source_externalEventKey: {
        shipmentId: input.shipmentId,
        source: input.source,
        externalEventKey: input.externalEventKey,
      },
    },
    select: { id: true },
  });
  if (!shipmentEvent) return { queued: false, reason: "EVENT_NOT_FOUND" };
  const result = await prisma.notificationDelivery.createMany({
    data: [{
      businessUnitId: input.businessUnitId,
      shipmentId: input.shipmentId,
      shipmentEventId: shipmentEvent.id,
      channel: "FEISHU_WEBHOOK",
      eventType: input.eventType,
      dedupeKey: `FEISHU_WEBHOOK:${input.source}:${input.shipmentId}:${input.externalEventKey}`,
    }],
    skipDuplicates: true,
  });
  return { queued: result.count === 1, reason: result.count === 1 ? "QUEUED" : "DUPLICATE" };
}

export function nextNotificationRetryAt(attempts: number, now = new Date()) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export function safeNotificationError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知通知发送错误";
  return message.replace(/https?:\/\/\S+/gi, "[REDACTED_URL]").slice(0, 500);
}
