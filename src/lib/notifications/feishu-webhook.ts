import { createHmac } from "node:crypto";
import type { NotificationMessage, NotificationProvider } from "./provider";

export function createFeishuBotSignature(timestamp: number, secret: string) {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

function assertSafeWebhookUrl(value: string) {
  const url = new URL(value);
  const allowedHost = url.hostname === "open.feishu.cn" || url.hostname === "open.larksuite.com";
  if (url.protocol !== "https:" || !allowedHost || !url.pathname.startsWith("/open-apis/bot/v2/hook/")) {
    throw new Error("飞书机器人 Webhook 地址格式不安全或不受支持");
  }
  return url.toString();
}

export class FeishuWebhookNotificationProvider implements NotificationProvider {
  readonly key = "FEISHU_WEBHOOK";
  private readonly webhookUrl: string;

  constructor(webhookUrl: string, private readonly secret?: string) {
    this.webhookUrl = assertSafeWebhookUrl(webhookUrl);
  }

  async send(message: NotificationMessage) {
    const content = message.url ? `${message.content}\n详情：${message.url}` : message.content;
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: `${message.title}\n${content}` },
        ...(this.secret ? { timestamp: String(timestamp), sign: createFeishuBotSignature(timestamp, this.secret) } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Feishu webhook failed with HTTP ${response.status}`);
    const payload = await response.json().catch(() => ({})) as { code?: number; msg?: string; data?: { message_id?: string } };
    if (payload.code && payload.code !== 0) throw new Error(payload.msg || "Feishu webhook rejected notification");
    return { delivered: true, providerMessageId: payload.data?.message_id };
  }
}

export function feishuWebhookFromEnv() {
  const url = process.env.FEISHU_BOT_WEBHOOK_URL?.trim();
  if (!url) return null;
  return new FeishuWebhookNotificationProvider(url, process.env.FEISHU_BOT_SECRET?.trim() || undefined);
}
