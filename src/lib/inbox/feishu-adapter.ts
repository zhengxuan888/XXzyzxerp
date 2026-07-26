import type { ChannelProviderAdapter, ProviderMessage } from "@/lib/inbox/provider";

type FeishuPayload = Record<string, unknown>;

function record(value: unknown): FeishuPayload {
  return value && typeof value === "object" ? value as FeishuPayload : {};
}

function textContent(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const parsed = JSON.parse(value) as FeishuPayload;
    return typeof parsed.text === "string" ? parsed.text : value;
  } catch {
    return value;
  }
}

export function parseFeishuMessage(payload: FeishuPayload): ProviderMessage | null {
  const event = record(payload.event);
  const message = record(event.message);
  const sender = record(event.sender);
  const senderId = record(sender.sender_id);
  const messageId = typeof message.message_id === "string" ? message.message_id : null;
  const chatId = typeof message.chat_id === "string" ? message.chat_id : null;
  const contactKey = typeof senderId.open_id === "string"
    ? senderId.open_id
    : typeof senderId.user_id === "string" ? senderId.user_id : null;
  if (!messageId || !chatId || !contactKey) return null;
  const timestamp = typeof message.create_time === "string" ? Number(message.create_time) : NaN;
  const occurredAt = Number.isFinite(timestamp) ? new Date(timestamp * 1000) : new Date();
  const messageType = typeof message.message_type === "string" ? message.message_type : "text";
  const content = textContent(message.content).trim();
  if (!content) return null;
  return {
    providerMessageKey: messageId,
    providerThreadKey: typeof message.root_id === "string" && message.root_id ? message.root_id : chatId,
    providerContactKey: contactKey,
    contactDisplayName: typeof sender.name === "string" ? sender.name : undefined,
    text: content.slice(0, 20_000),
    contentType: messageType,
    occurredAt,
    normalizedAddress: contactKey,
  };
}

export class FeishuWebhookAdapter implements ChannelProviderAdapter {
  readonly key = "FEISHU";

  constructor(private readonly message: ProviderMessage) {}

  async pull() {
    return { messages: [this.message], nextCursor: this.message.providerMessageKey };
  }
}
