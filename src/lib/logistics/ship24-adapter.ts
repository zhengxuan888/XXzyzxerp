import { ProviderConfigurationError, ProviderRequestError, type LogisticsProviderEvent, type TrackingProviderAdapter, type TrackingProviderResult, withRetry } from "@/lib/logistics/provider";

const DEFAULT_BASE_URL = "https://api.ship24.com";

export type Ship24Config = { apiKey: string; baseUrl?: string; enabled?: boolean; timeoutMs?: number };

export function ship24ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Ship24Config | null {
  const apiKey = env.SHIP24_API_KEY?.trim();
  if (!apiKey || env.SHIP24_ENABLED !== "true") return null;
  return { apiKey, baseUrl: env.SHIP24_API_BASE_URL || DEFAULT_BASE_URL, enabled: true, timeoutMs: Number(env.SHIP24_TIMEOUT_MS || 10_000) };
}

export class Ship24Adapter implements TrackingProviderAdapter {
  readonly key = "SHIP24";
  constructor(private readonly config: Ship24Config) {
    if (!config.apiKey || config.enabled !== true) throw new ProviderConfigurationError("Ship24 未启用或缺少 API Key");
  }

  async track(trackingNo: string, carrier?: string): Promise<TrackingProviderResult> {
    if (!trackingNo.trim()) throw new ProviderRequestError("物流单号不能为空", false);
    const url = `${(this.config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/trackers/track`; 
    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ trackingNumber: trackingNo, courierCode: carrier }), signal: controller.signal });
        if (!response.ok) throw new ProviderRequestError(`Ship24 请求失败（${response.status}）`, response.status >= 500 || response.status === 429);
        return normalizeShip24(await response.json(), trackingNo, carrier);
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        throw new ProviderRequestError("Ship24 请求异常");
      } finally { clearTimeout(timeout); }
    });
  }
}

export function normalizeShip24(payload: unknown, trackingNo: string, carrier?: string): TrackingProviderResult {
  const root = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const raw = Array.isArray(data.events) ? data.events : Array.isArray(data.trackings) ? data.trackings : [];
  const events: LogisticsProviderEvent[] = raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const occurredAt = new Date(String(row.dateTime || row.datetime || row.eventTime || ""));
    if (Number.isNaN(occurredAt.getTime())) return [];
    return [{ externalEventKey: String(row.eventId || row.id || `${occurredAt.toISOString()}-${index}`), status: String(row.status || row.statusCode || "UNKNOWN").toUpperCase(), description: typeof row.statusMilestone === "string" ? row.statusMilestone : typeof row.description === "string" ? row.description : undefined, location: typeof row.location === "string" ? row.location : undefined, occurredAt }];
  }).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return { trackingNo, carrier: carrier || (typeof data.courierCode === "string" ? data.courierCode : undefined), events };
}

export class DemoTrackingAdapter implements TrackingProviderAdapter {
  readonly key = "DEMO";
  async track(trackingNo: string, carrier = "DEMO"): Promise<TrackingProviderResult> {
    return { trackingNo, carrier, events: [{ externalEventKey: `demo-${trackingNo}-picked-up`, status: "PICKED_UP", description: "Demo 已发出", occurredAt: new Date() }] };
  }
}
