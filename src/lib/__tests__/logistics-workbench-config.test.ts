import { describe, expect, it } from "vitest";

import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";

describe("logistics workbench configuration", () => {
  it("sanitizes tags and keeps every stable queue key configurable", () => {
    const config = parseLogisticsWorkbenchConfig({
      quickTags: [" 已通知 ", "已通知", "", 1],
      cards: [
        { key: "critical", label: " 立即处理 ", isVisible: true, sortOrder: 1 },
        { key: "unknown", label: "无效" },
      ],
      alertRules: [
        { key: "ES", matches: ["西班牙", "Spain"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 2 },
        { key: "BAD", matches: [], milestoneEvent: "UNKNOWN", silentWorkDaysBeforeMilestone: -1 },
      ],
      syncIntervalMinutes: 45,
    });
    expect(config.quickTags).toEqual(["已通知"]);
    expect(config.cards[0]).toMatchObject({ key: "critical", label: "立即处理", sortOrder: 1 });
    expect(config.cards).toHaveLength(18);
    expect(config.cards.map((card) => card.key)).toEqual(expect.arrayContaining([
      "all",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "unhandled",
      "address_error",
      "delivery_failed",
      "ready_for_pickup",
      "refused",
      "read_no_reply",
      "unread_no_reply",
      "tracking_offline",
      "other_exception",
    ]));
    expect(config.cards.find((card) => card.key === "address_error")?.matches).toContain("EVENT:ADDRESS_ERROR");
    expect(config.alertRules).toEqual([{ key: "ES", matches: ["西班牙", "Spain"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 2 }]);
    expect(config.syncIntervalMinutes).toBe(45);
  });
});
