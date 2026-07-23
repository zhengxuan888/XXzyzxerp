import { describe, expect, it } from "vitest";

import { canTransitionOrder } from "../order-state";

describe("order state machine", () => {
  it("permits the operational happy path", () => {
    expect(canTransitionOrder("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionOrder("SUBMITTED", "WAITING_SHIPMENT")).toBe(true);
    expect(canTransitionOrder("WAITING_SHIPMENT", "SHIPPED")).toBe(true);
    expect(canTransitionOrder("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "COMPLETED")).toBe(true);
  });

  it("blocks skips and terminal-state changes", () => {
    expect(canTransitionOrder("DRAFT", "SHIPPED")).toBe(false);
    expect(canTransitionOrder("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransitionOrder("CANCELLED", "DRAFT")).toBe(false);
  });

  it("supports review rejection and shipment recovery without bypassing review", () => {
    expect(canTransitionOrder("SUBMITTED", "DRAFT")).toBe(true);
    expect(canTransitionOrder("EXCEPTION", "SHIPPED")).toBe(true);
    expect(canTransitionOrder("DRAFT", "WAITING_SHIPMENT")).toBe(false);
    expect(canTransitionOrder("SUBMITTED", "SHIPPED")).toBe(false);
  });
});
