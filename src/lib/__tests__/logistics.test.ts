import { describe, expect, it } from "vitest";

import {
  getAlertRuleForShipmentLocation,
  getParsedAlertRuleConfig,
  resolveHighPriorityIndex,
  getHighPrioritySilenceLimit,
  parseShipmentEventPayload,
  shouldSuppressHighPriorityFollowUp,
} from "../logistics";

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

  it("uses configured silence count for high priority events", () => {
    process.env.LOGISTICS_HIGH_PRIORITY_INITIAL_SILENCE = "2";
    expect(getHighPrioritySilenceLimit()).toBe(2);
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        highPriorityIndex: 1,
        countryRuleName: null,
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: null,
        lastTrackedAt: null,
        occurredAt: new Date("2026-07-23T08:30:00.000Z"),
      }),
    ).toBe(true);
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        highPriorityIndex: 2,
        countryRuleName: null,
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: null,
        lastTrackedAt: null,
        occurredAt: new Date("2026-07-23T08:30:00.000Z"),
      }),
    ).toBe(true);
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        highPriorityIndex: 3,
        countryRuleName: null,
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: null,
        lastTrackedAt: null,
        occurredAt: new Date("2026-07-23T08:30:00.000Z"),
      }),
    ).toBe(false);
    expect(
      shouldSuppressHighPriorityFollowUp("IN_TRANSIT", {
        highPriorityIndex: 1,
        countryRuleName: null,
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: null,
        lastTrackedAt: null,
        occurredAt: new Date("2026-07-23T08:30:00.000Z"),
      }),
    ).toBe(false);
    process.env.LOGISTICS_HIGH_PRIORITY_INITIAL_SILENCE = undefined;
  });

  it("respects country rule initial window", () => {
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        countryRuleName: "GREECE",
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        lastTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        occurredAt: new Date("2026-07-23T12:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        countryRuleName: "GREECE",
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        lastTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        occurredAt: new Date("2026-07-26T09:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("falls back to default rules on invalid location config payload", () => {
    const old = process.env.LOGISTICS_COUNTRY_ALERT_RULES;
    process.env.LOGISTICS_COUNTRY_ALERT_RULES = "invalid-json";
    expect(getAlertRuleForShipmentLocation("greece")).toMatchObject({ key: "GREECE" });
    expect(getParsedAlertRuleConfig().hasInvalidPayload).toBe(true);
    expect(getParsedAlertRuleConfig().invalidEntries).toBeGreaterThan(0);
    process.env.LOGISTICS_COUNTRY_ALERT_RULES = old;
  });

  it("handles unknown country and missing location as no rule", () => {
    expect(getAlertRuleForShipmentLocation(null)).toBeNull();
    expect(getAlertRuleForShipmentLocation("")).toBeNull();
    expect(getAlertRuleForShipmentLocation("unknown-state-abcd")).toBeNull();
  });

  it("computes deterministic high-priority index for duplicate and out-of-order events", () => {
    const history = [
      { eventType: "EXCEPTION" as const, occurredAt: new Date("2026-07-23T08:00:00.000Z") },
      { eventType: "EXCEPTION" as const, occurredAt: new Date("2026-07-23T08:05:00.000Z") },
      { eventType: "OUT_FOR_DELIVERY" as const, occurredAt: new Date("2026-07-23T08:02:00.000Z") },
    ];

    const duplicate = resolveHighPriorityIndex(history, {
      eventType: "EXCEPTION",
      occurredAt: new Date("2026-07-23T08:05:00.000Z"),
    });
    expect(duplicate.isDuplicate).toBe(true);
    expect(duplicate.isOutOfOrder).toBe(false);
    expect(duplicate.highPriorityIndex).toBeGreaterThan(0);

    const outOfOrder = resolveHighPriorityIndex(history, {
      eventType: "EXCEPTION",
      occurredAt: new Date("2026-07-23T07:55:00.000Z"),
    });
    expect(outOfOrder.isOutOfOrder).toBe(true);
    expect(outOfOrder.highPriorityIndex).toBe(1);
    expect(outOfOrder.isDuplicate).toBe(false);
  });

  it("reuses country rule rule-specific silence if present and keeps invalid config entries", () => {
    const old = process.env.LOGISTICS_COUNTRY_ALERT_RULES;
    process.env.LOGISTICS_COUNTRY_ALERT_RULES = JSON.stringify([
      { key: "A", matches: ["alpha"], milestoneEvent: "OUT_FOR_DELIVERY", silentWorkDaysBeforeMilestone: 1 },
      { key: "B", matches: ["beta"] },
    ]);
    expect(getParsedAlertRuleConfig().hasInvalidPayload).toBe(true);
    expect(getParsedAlertRuleConfig().rules).toMatchObject([
      { key: "A", matches: ["alpha"], milestoneEvent: "OUT_FOR_DELIVERY", silentWorkDaysBeforeMilestone: 1 },
    ]);
    expect(getParsedAlertRuleConfig().invalidEntries).toBe(1);
    expect(
      shouldSuppressHighPriorityFollowUp("EXCEPTION", {
        highPriorityIndex: 1,
        countryRuleName: "A",
        hasActiveHighPriorityFollowUp: false,
        isMilestoneReached: false,
        firstTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        lastTrackedAt: new Date("2026-07-23T08:00:00.000Z"),
        occurredAt: new Date("2026-07-23T08:10:00.000Z"),
      }),
    ).toBe(true);
    process.env.LOGISTICS_COUNTRY_ALERT_RULES = old;
  });
});
