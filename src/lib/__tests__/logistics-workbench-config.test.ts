import { describe, expect, it } from "vitest";

import {
  logisticsFixedQuickTagLabels,
  logisticsPriorityQuickTags,
  logisticsQueueCardGroups,
  logisticsQueueCardsForDisplay,
  logisticsQuickTagFilterLimit,
  logisticsQuickTagGroups,
  matchesLogisticsQuickTagFilters,
  parseLogisticsQuickTagFilters,
  parseLogisticsWorkbenchConfig,
} from "@/lib/logistics-workbench-config";

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
    expect(config.quickTags).toEqual([...logisticsFixedQuickTagLabels, "已通知"]);
    expect(config.cards[0]).toMatchObject({ key: "critical", label: "跟进已超期", sortOrder: 1 });
    expect(config.cards).toHaveLength(24);
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
    expect(config.cards.find((card) => card.key === "ready_for_pickup")).toMatchObject({ label: "到达代取" });
    expect(config.alertRules).toEqual([{ key: "ES", matches: ["西班牙", "Spain"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 2 }]);
    expect(config.syncIntervalMinutes).toBe(45);
  });

  it("keeps existing custom quick tags after adding the fixed color tags", () => {
    const customTags = Array.from({ length: 20 }, (_, index) => `自定义${index + 1}`);
    const config = parseLogisticsWorkbenchConfig({ quickTags: customTags });
    expect(config.quickTags).toEqual([...logisticsFixedQuickTagLabels, ...customTags]);
  });

  it("keeps every fixed quick tag ahead of the limit without duplicating 派送中", () => {
    const customTags = Array.from({ length: 40 }, (_, index) => `自定义${index + 1}`);
    const config = parseLogisticsWorkbenchConfig({ quickTags: customTags });
    expect(config.quickTags).toHaveLength(40);
    expect(config.quickTags.slice(0, logisticsFixedQuickTagLabels.length)).toEqual(logisticsFixedQuickTagLabels);
    expect(config.quickTags.filter((tag) => tag === "派送中")).toHaveLength(1);
  });

  it("pins the six priority shortcuts in the card grid for an old saved configuration", () => {
    const config = parseLogisticsWorkbenchConfig({
      cards: [
        { key: "critical", label: "旧超期", isVisible: true, sortOrder: 1 },
        { key: "problem", label: "物流问题", isVisible: false, sortOrder: 2 },
        { key: "pending_delivery_confirmation", label: "待确认签收", isVisible: false, sortOrder: 3 },
        { key: "due_today", label: "今日需跟进", isVisible: false, sortOrder: 4 },
        { key: "out_for_delivery", label: "旧派送", isVisible: false, sortOrder: 5 },
        { key: "normal", label: "正常运输", isVisible: false, sortOrder: 6 },
        { key: "exception", label: "物流异常", isVisible: true, sortOrder: 7 },
      ],
    });
    const cards = logisticsQueueCardsForDisplay(config);
    expect(cards.filter((card) => logisticsPriorityQuickTags.some((item) => item.key === card.key)).map((card) => card.label)).toEqual([
      "跟进已超期",
      "物流异常",
      "待人工确认签收",
      "今日需要跟进",
      "派送中",
      "普通运输",
    ]);
    expect(cards.filter((card) => card.label === "物流异常")).toHaveLength(1);
    expect(cards.some((card) => card.key === "exception")).toBe(false);
  });

  it("parses only configured quick-tag filters and matches several selections with OR semantics", () => {
    const allowed = ["派送中", "已通知客户", "无人接听"];
    expect(parseLogisticsQuickTagFilters(" 无人接听,未知,派送中,无人接听 ", allowed)).toEqual(["无人接听", "派送中"]);
    expect(matchesLogisticsQuickTagFilters(["EVENT:IN_TRANSIT", "TAG:无人接听"], ["派送中", "无人接听"])).toBe(true);
    expect(matchesLogisticsQuickTagFilters(["TAG:已通知客户"], ["派送中", "无人接听"])).toBe(false);
    expect(matchesLogisticsQuickTagFilters([], [])).toBe(true);
  });

  it("groups quick tags once with every color tag kept under logistics status", () => {
    const groups = logisticsQuickTagGroups([
      "派送中",
      "跟进已超期",
      "已通知客户",
      "不读不回",
      "派送中",
      "今日需要跟进",
    ]);
    expect(groups).toEqual([
      { key: "logistics_status", label: "物流状态", tags: ["派送中", "不读不回"] },
      { key: "follow_up", label: "跟进提醒", tags: ["跟进已超期", "今日需要跟进"] },
      { key: "customer_communication", label: "客户沟通", tags: ["已通知客户"] },
    ]);
    expect(groups.flatMap((group) => group.tags).filter((tag) => tag === "派送中")).toHaveLength(1);
  });

  it("groups every displayed queue card exactly once", () => {
    const config = parseLogisticsWorkbenchConfig(null);
    const displayedCards = logisticsQueueCardsForDisplay(config);
    const groups = logisticsQueueCardGroups(config);
    const groupedCards = groups.flatMap((group) => group.cards);
    expect(groups.map((group) => group.label)).toEqual(["物流进度", "跟进任务", "异常与售后"]);
    expect(new Set(groupedCards.map((card) => card.key)).size).toBe(groupedCards.length);
    expect(groupedCards.map((card) => card.key).sort()).toEqual(displayedCards.map((card) => card.key).sort());
    expect(groups.find((group) => group.key === "progress")?.cards.some((card) => card.key === "closed")).toBe(true);
    expect(groups.find((group) => group.key === "follow_up")?.cards.some((card) => card.key === "normal")).toBe(true);
    expect(groups.find((group) => group.key === "exceptions")?.cards.some((card) => card.key === "read_no_reply")).toBe(true);
  });

  it("matches whole quick-tag signals exactly and caps URL selections", () => {
    const allowed = Array.from({ length: logisticsQuickTagFilterLimit + 2 }, (_, index) => `标签${index + 1}`);
    expect(parseLogisticsQuickTagFilters(`${allowed.join(",")},标签1`, allowed)).toEqual(allowed.slice(0, logisticsQuickTagFilterLimit));
    expect(parseLogisticsQuickTagFilters("标签1附加,标签1", allowed)).toEqual(["标签1"]);
    expect(matchesLogisticsQuickTagFilters(["TAG:无人接听-稍后再联", "EVENT:无人接听"], ["无人接听"])).toBe(false);
    expect(matchesLogisticsQuickTagFilters(["TAG:无人接听"], ["无人接听"])).toBe(true);
  });
});
