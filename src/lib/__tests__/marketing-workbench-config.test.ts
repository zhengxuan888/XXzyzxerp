import { describe, expect, it } from "vitest";

import { marketingWorkbenchCardAppliesToMembership, parseMarketingWorkbenchConfig } from "../marketing-workbench-config";

describe("marketing workbench configuration", () => {
  it("keeps an explicit empty card list empty instead of silently restoring demo cards", () => {
    expect(parseMarketingWorkbenchConfig({ cards: [] }).cards).toEqual([]);
  });

  it("rejects unsafe card links and incomplete cards", () => {
    const config = parseMarketingWorkbenchConfig({
      cards: [
        { key: "unsafe", kind: "QUICK_ACTION", label: "unsafe", description: "unsafe", isVisible: true, zone: "QUICK", sortOrder: 1, audience: {}, actionKey: "marketing.report.read", href: "https://outside.example" },
        { key: "missing-metric", kind: "METRIC", label: "missing", description: "missing", isVisible: true, zone: "OVERVIEW", sortOrder: 2, audience: {} },
      ],
    });
    expect(config.cards).toEqual([]);
  });

  it("uses configured audience as an additional restriction rather than a broad allow", () => {
    const [card] = parseMarketingWorkbenchConfig({
      cards: [
        {
          key: "team-queue",
          kind: "QUEUE",
          label: "团队待办",
          description: "仅给被配置的成员展示。",
          isVisible: true,
          zone: "FOCUS",
          sortOrder: 1,
          audience: { roleIds: ["role-a"], departmentIds: ["dept-a"], membershipIds: [] },
          queueKey: "PENDING_REVIEW",
          actionKey: "marketing.report.review",
          href: "/admin/marketing/reports?status=SUBMITTED",
        },
      ],
    }).cards;
    expect(card).toBeDefined();
    expect(marketingWorkbenchCardAppliesToMembership(card!, { id: "member-a", roleId: "role-a", departmentId: "dept-a" })).toBe(true);
    expect(marketingWorkbenchCardAppliesToMembership(card!, { id: "member-a", roleId: "role-b", departmentId: "dept-a" })).toBe(false);
    expect(marketingWorkbenchCardAppliesToMembership(card!, { id: "member-a", roleId: "role-a", departmentId: "dept-b" })).toBe(false);
  });
});
