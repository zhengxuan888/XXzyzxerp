import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFeishuBotSignature,
  FeishuWebhookNotificationProvider,
  feishuWebhookFromEnv,
} from "@/lib/notifications/feishu-webhook";

describe("飞书物流通知 Provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FEISHU_BOT_WEBHOOK_URL;
    delete process.env.FEISHU_BOT_SECRET;
  });

  it("未配置 Webhook 时保持禁用，不发外部请求", () => {
    expect(feishuWebhookFromEnv()).toBeNull();
  });

  it("拒绝 HTTP、未知域名和非机器人路径", () => {
    expect(() => new FeishuWebhookNotificationProvider("http://open.feishu.cn/open-apis/bot/v2/hook/demo")).toThrow();
    expect(() => new FeishuWebhookNotificationProvider("https://example.com/open-apis/bot/v2/hook/demo")).toThrow();
    expect(() => new FeishuWebhookNotificationProvider("https://open.feishu.cn/not-a-bot/demo")).toThrow();
  });

  it("按飞书协议生成时间戳签名，不回显 Secret", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_599_360_473_000);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { message_id: "om_demo" } }), { status: 200 }),
    );
    const provider = new FeishuWebhookNotificationProvider(
      "https://open.feishu.cn/open-apis/bot/v2/hook/demo",
      "test-secret",
    );

    await expect(provider.send({ title: "物流高优先级提醒", content: "订单 ORD-001 需要售后处理" }))
      .resolves.toEqual({ delivered: true, providerMessageId: "om_demo" });

    const request = fetchMock.mock.calls[0];
    const body = JSON.parse(String((request[1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.timestamp).toBe("1599360473");
    expect(body.sign).toBe(createFeishuBotSignature(1_599_360_473, "test-secret"));
    expect(body).not.toHaveProperty("secret");
  });
});
