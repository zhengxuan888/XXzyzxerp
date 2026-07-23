export type ProviderMessage = {
  providerMessageKey: string;
  providerThreadKey: string;
  providerContactKey: string;
  contactDisplayName?: string;
  subject?: string;
  text: string;
  occurredAt: Date;
};

export interface ChannelProviderAdapter {
  readonly key: string;
  pull(cursor?: string | null): Promise<{ messages: ProviderMessage[]; nextCursor: string }>;
}

export function messageIdempotencyKey(connectionId: string, message: ProviderMessage) {
  return `${connectionId}:${message.providerMessageKey}`;
}
