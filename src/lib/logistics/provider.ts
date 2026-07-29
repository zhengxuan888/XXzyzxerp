import type { LogisticsWorkStatus, ShipmentStatus } from "@prisma/client";

export type LogisticsProviderEvent = {
  externalEventKey: string;
  status: string;
  description?: string;
  location?: string;
  occurredAt: Date;
};

export type TrackingProviderResult = {
  trackingNo: string;
  carrier?: string;
  events: LogisticsProviderEvent[];
};

export interface TrackingProviderAdapter {
  readonly key: string;
  track(trackingNo: string, carrier?: string): Promise<TrackingProviderResult>;
}

const PROVIDER_STATUS_ALIASES: Array<{ pattern: RegExp; eventType: string; status: ShipmentStatus; workStatus: LogisticsWorkStatus; priority: "HIGH" | "NORMAL" }> = [
  { pattern: /DELIVERED|SIGNED|签收|已送达/i, eventType: "DELIVERED", status: "DELIVERED", workStatus: "CLOSED", priority: "NORMAL" },
  { pattern: /OUT.?FOR.?DELIVERY|派送中|准备派送|TODAY.*DELIVER/i, eventType: "OUT_FOR_DELIVERY", status: "OUT_FOR_DELIVERY", workStatus: "IN_PROGRESS", priority: "HIGH" },
  { pattern: /ADDRESS|地址错误/i, eventType: "ADDRESS_ERROR", status: "EXCEPTION", workStatus: "WAITING_CUSTOMER", priority: "HIGH" },
  { pattern: /REFUS|拒收/i, eventType: "REFUSED", status: "EXCEPTION", workStatus: "NEEDS_ATTENTION", priority: "HIGH" },
  { pattern: /RETURNED|已退回/i, eventType: "RETURNED", status: "RETURNED", workStatus: "RESOLVED", priority: "HIGH" },
  { pattern: /RETURN|退回/i, eventType: "RETURNING", status: "RETURNING", workStatus: "WAITING_CARRIER", priority: "HIGH" },
  { pattern: /FAIL|EXCEPTION|异常|派送失败/i, eventType: "EXCEPTION", status: "EXCEPTION", workStatus: "NEEDS_ATTENTION", priority: "HIGH" },
  { pattern: /PICKED.?UP|已发出|揽收/i, eventType: "PICKED_UP", status: "PICKED_UP", workStatus: "MONITORING", priority: "NORMAL" },
  { pattern: /IN.?TRANSIT|运输中|转运/i, eventType: "IN_TRANSIT", status: "IN_TRANSIT", workStatus: "MONITORING", priority: "NORMAL" },
];

export function normalizeProviderEventStatus(raw: string) {
  const value = raw.trim().toUpperCase();
  const match = PROVIDER_STATUS_ALIASES.find((item) => item.pattern.test(value));
  return match ? { eventType: match.eventType, status: match.status, workStatus: match.workStatus, priority: match.priority } : null;
}

export function providerFollowUpAt(rawStatus: string, occurredAt: Date) {
  const normalized = normalizeProviderEventStatus(rawStatus);
  if (!normalized || normalized.status === "DELIVERED" || normalized.status === "CANCELLED") return null;
  return new Date(occurredAt.getTime() + (normalized.priority === "HIGH" ? 6 : 24) * 60 * 60 * 1000);
}

export function shouldApplyProviderStatus(current: ShipmentStatus, next: ShipmentStatus) {
  const terminal = new Set<ShipmentStatus>(["DELIVERED", "CLOSED", "CANCELLED"]);
  return !terminal.has(current) || terminal.has(next);
}

export class ProviderConfigurationError extends Error {}
export class ProviderRequestError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); }
}

/** Prevents duplicate provider requests during a single process lifetime. */
export class IdempotentTrackingRunner {
  private readonly inFlight = new Map<string, Promise<TrackingProviderResult>>();

  run(key: string, operation: () => Promise<TrackingProviderResult>) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const request = operation().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }
}

export async function withRetry<T>(operation: () => Promise<T>, options: { attempts?: number; delayMs?: number } = {}) {
  const attempts = Math.max(1, options.attempts ?? 3);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (error instanceof ProviderRequestError && !error.retryable) throw error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, (options.delayMs ?? 100) * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("物流服务请求失败");
}
