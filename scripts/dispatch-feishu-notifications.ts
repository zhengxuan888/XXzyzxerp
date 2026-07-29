import { feishuWebhookFromEnv } from "@/lib/notifications/feishu-webhook";
import { nextNotificationRetryAt, safeNotificationError } from "@/lib/notifications/logistics-delivery";
import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;

async function main() {
  const provider = feishuWebhookFromEnv();
  if (!provider) {
    console.log("Feishu webhook disabled or missing; notification queue remains pending.");
    return;
  }
  const now = new Date();
  const staleLock = new Date(now.getTime() - 10 * 60_000);
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      channel: provider.key,
      OR: [
        { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lockedAt: { lte: staleLock } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: 50,
    include: { shipment: { select: { order: { select: { orderNo: true } } } } },
  });
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const claimed = await prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          { status: { in: ["PENDING", "RETRY"] } },
          { status: "PROCESSING", lockedAt: { lte: staleLock } },
        ],
      },
      data: { status: "PROCESSING", lockedAt: new Date() },
    });
    if (!claimed.count) continue;
    try {
      const orderNo = delivery.shipment?.order.orderNo ?? "未知订单";
      const result = await provider.send({
        title: "ERP 物流售后提醒",
        content: `订单 ${orderNo} 出现轨迹：${delivery.eventType}。请登录 ERP 按权限查看并及时联系客户。`,
        url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/admin/shipments` : undefined,
      });
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: new Date(), lockedAt: null, attempts: { increment: 1 }, providerMessageId: result.providerMessageId ?? null, lastError: null },
      });
      sent += 1;
    } catch (error) {
      const attempts = delivery.attempts + 1;
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "DEAD" : "RETRY",
          attempts,
          lockedAt: null,
          nextAttemptAt: nextNotificationRetryAt(attempts),
          lastError: safeNotificationError(error),
        },
      });
      failed += 1;
    }
  }
  console.log(JSON.stringify({ selected: deliveries.length, sent, failed }));
}

main().finally(() => prisma.$disconnect());
