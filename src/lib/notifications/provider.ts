export type NotificationMessage = {
  title: string;
  content: string;
  url?: string;
};

export interface NotificationProvider {
  readonly key: string;
  send(message: NotificationMessage): Promise<{ delivered: boolean; providerMessageId?: string }>;
}
