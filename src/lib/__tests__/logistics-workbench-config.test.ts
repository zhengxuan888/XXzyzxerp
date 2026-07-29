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
    });
    expect(config.quickTags).toEqual(["已通知"]);
    expect(config.cards[0]).toMatchObject({ key: "critical", label: "立即处理", sortOrder: 1 });
    expect(config.cards.map((card) => card.key).sort()).toEqual(["all", "critical", "high", "normal", "unhandled"]);
  });
});
