import { describe, expect, it } from "vitest";
import {
  nextNotificationRetryAt,
  safeNotificationError,
  shouldQueueLogisticsNotification,
} from "@/lib/notifications/logistics-delivery";

describe("物流飞书通知队列", () => {
  it("默认关闭，且可配置只接收高优先级事件", () => {
    expect(shouldQueueLogisticsNotification({
      feishuNotificationsEnabled: false,
      feishuHighPriorityOnly: false,
    }, "HIGH")).toBe(false);
    expect(shouldQueueLogisticsNotification({
      feishuNotificationsEnabled: true,
      feishuHighPriorityOnly: true,
    }, "NORMAL")).toBe(false);
    expect(shouldQueueLogisticsNotification({
      feishuNotificationsEnabled: true,
      feishuHighPriorityOnly: true,
    }, "HIGH")).toBe(true);
  });

  it("指数退避但最长不超过 60 分钟", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    expect(nextNotificationRetryAt(1, now).toISOString()).toBe("2026-07-29T00:01:00.000Z");
    expect(nextNotificationRetryAt(3, now).toISOString()).toBe("2026-07-29T00:04:00.000Z");
    expect(nextNotificationRetryAt(20, now).toISOString()).toBe("2026-07-29T01:00:00.000Z");
  });

  it("错误日志不会泄漏 Webhook URL", () => {
    expect(safeNotificationError(new Error("failed https://open.feishu.cn/open-apis/bot/v2/hook/secret")))
      .toBe("failed [REDACTED_URL]");
  });
});
