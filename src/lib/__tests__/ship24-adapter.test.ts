import { describe, expect, it, vi } from "vitest";
import { DemoTrackingAdapter, normalizeShip24, ship24ConfigFromEnv } from "@/lib/logistics/ship24-adapter";
import { normalizeProviderEventStatus, providerFollowUpAt, shouldApplyProviderStatus } from "@/lib/logistics/provider";

describe("Ship24 tracking adapter", () => {
  it("keeps real provider disabled without explicit config", () => {
    expect(ship24ConfigFromEnv({ NODE_ENV: "test", SHIP24_API_KEY: "demo" })).toBeNull();
    expect(ship24ConfigFromEnv({ NODE_ENV: "test", SHIP24_API_KEY: "demo", SHIP24_ENABLED: "true" })).toMatchObject({ apiKey: "demo", enabled: true });
  });

  it("normalizes and sorts provider events", () => {
    const result = normalizeShip24({ data: { events: [
      { id: "late", dateTime: "2026-07-02T00:00:00Z", status: "DELIVERED", location: "B" },
      { id: "early", dateTime: "2026-07-01T00:00:00Z", status: "IN_TRANSIT", description: "moving" },
      { id: "bad", dateTime: "invalid", status: "UNKNOWN" },
    ] } }, "TRACK-1", "demo");
    expect(result.events.map((event) => event.externalEventKey)).toEqual(["early", "late"]);
    expect(result.events[0].status).toBe("IN_TRANSIT");
  });

  it("normalizes the official nested tracking response", () => {
    const result = normalizeShip24({ data: { trackings: [{ events: [
      { eventId: "evt-1", occurrenceDatetime: "2026-07-03T08:30:00Z", status: "Out for delivery", statusMilestone: "out_for_delivery", location: "Madrid" },
    ] }] } }, "TRACK-2");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalEventKey: "evt-1",
      status: "OUT_FOR_DELIVERY",
      description: "Out for delivery",
      location: "Madrid",
    });
  });

  it("provides deterministic local demo events", async () => {
    const adapter = new DemoTrackingAdapter();
    const first = await adapter.track("TRACK-1");
    const second = await adapter.track("TRACK-1");
    expect(first.events[0].externalEventKey).toBe(second.events[0].externalEventKey);
  });

  it("does not call fetch for demo adapter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await new DemoTrackingAdapter().track("TRACK-2");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps provider statuses into stable shipment and after-sales states", () => {
    expect(normalizeProviderEventStatus("out_for_delivery")).toMatchObject({
      eventType: "OUT_FOR_DELIVERY",
      status: "OUT_FOR_DELIVERY",
      workStatus: "IN_PROGRESS",
      priority: "HIGH",
    });
    expect(normalizeProviderEventStatus("地址错误")).toMatchObject({
      eventType: "ADDRESS_ERROR",
      status: "EXCEPTION",
      workStatus: "WAITING_CUSTOMER",
    });
    expect(normalizeProviderEventStatus("refused by recipient")).toMatchObject({
      eventType: "REFUSED",
      status: "EXCEPTION",
      priority: "HIGH",
    });
    expect(normalizeProviderEventStatus("provider_specific_unknown")).toBeNull();
  });

  it("schedules urgent and normal follow-ups without reopening delivered shipments", () => {
    const occurredAt = new Date("2026-07-29T00:00:00.000Z");
    expect(providerFollowUpAt("OUT_FOR_DELIVERY", occurredAt)?.toISOString()).toBe("2026-07-29T06:00:00.000Z");
    expect(providerFollowUpAt("IN_TRANSIT", occurredAt)?.toISOString()).toBe("2026-07-30T00:00:00.000Z");
    expect(providerFollowUpAt("DELIVERED", occurredAt)).toBeNull();
    expect(shouldApplyProviderStatus("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(shouldApplyProviderStatus("CLOSED", "EXCEPTION")).toBe(false);
    expect(shouldApplyProviderStatus("IN_TRANSIT", "DELIVERED")).toBe(true);
    expect(shouldApplyProviderStatus("OUT_FOR_DELIVERY", "IN_TRANSIT")).toBe(false);
    expect(shouldApplyProviderStatus("IN_TRANSIT", "PICKED_UP")).toBe(false);
    expect(shouldApplyProviderStatus("EXCEPTION", "OUT_FOR_DELIVERY")).toBe(true);
    expect(shouldApplyProviderStatus("IN_TRANSIT", "RETURNING")).toBe(true);
    expect(shouldApplyProviderStatus("RETURNING", "RETURNED")).toBe(true);
    expect(shouldApplyProviderStatus("RETURNED", "IN_TRANSIT")).toBe(false);
  });
});
