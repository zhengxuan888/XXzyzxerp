import { describe, expect, it } from "vitest";

import { parseShipmentEventPayload } from "../logistics";

describe("logistics payload integrity", () => {
  it("preserves timestamp, exception reason, severity, and memo end to end", () => {
    const parsed = parseShipmentEventPayload({
      eventType: "exception",
      occurredAt: "2026-07-23T08:30:00.000Z",
      memo: "Customer unreachable",
      exceptionReason: "PHONE_UNREACHABLE",
      exceptionSeverity: "high",
    });
    expect(parsed).toMatchObject({
      eventType: "EXCEPTION",
      status: "EXCEPTION",
      memo: "Customer unreachable",
      exceptionReason: "PHONE_UNREACHABLE",
      exceptionSeverity: "HIGH",
    });
    expect(parsed.occurredAt.toISOString()).toBe("2026-07-23T08:30:00.000Z");
  });

  it("rejects unknown events and incomplete exceptions", () => {
    expect(() => parseShipmentEventPayload({ eventType: "UNKNOWN" })).toThrow("INVALID_SHIPMENT_EVENT_TYPE");
    expect(() => parseShipmentEventPayload({ eventType: "EXCEPTION" })).toThrow("EXCEPTION_REASON_REQUIRED");
  });
});
