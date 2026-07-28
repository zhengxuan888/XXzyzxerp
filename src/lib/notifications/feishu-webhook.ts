import type { NotificationMessage, NotificationProvider } from "./provider";

export class FeishuWebhookNotificationProvider implements NotificationProvider {
  readonly key = "FEISHU_WEBHOOK";

  constructor(private readonly webhookUrl: string, private readonly secret?: string) {}

  async send(message: NotificationMessage) {
    const content = message.url ? `${message.content}\n详情：${message.url}` : message.content;
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: `${message.title}\n${content}` },
        ...(this.secret ? { secret: this.secret } : {}),
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
