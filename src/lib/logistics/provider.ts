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
