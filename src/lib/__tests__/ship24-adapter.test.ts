import { describe, expect, it, vi } from "vitest";
import { DemoTrackingAdapter, normalizeShip24, ship24ConfigFromEnv } from "@/lib/logistics/ship24-adapter";

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
});
