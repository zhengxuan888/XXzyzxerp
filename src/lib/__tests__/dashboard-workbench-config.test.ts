import { describe, expect, it } from "vitest";

import {
  dashboardCardAppliesToMembership,
  parseDashboardWorkbenchConfig,
} from "@/lib/dashboard-workbench-config";

describe("dashboard workbench configuration", () => {
  it("keeps only supported metric keys and restores missing defaults", () => {
    const config = parseDashboardWorkbenchConfig({
      cards: [
        { key: "order_review", label: "待核单", isVisible: false, zone: "OVERVIEW", sortOrder: 4 },
        { key: "unsafe_query", label: "不应出现" },
      ],
    });
    expect(config.cards).toHaveLength(7);
    expect(config.cards.find((card) => card.key === "order_review")).toMatchObject({
      label: "待核单",
      isVisible: false,
      zone: "OVERVIEW",
      sortOrder: 4,
    });
  });

  it("requires every configured audience dimension to match", () => {
    const config = parseDashboardWorkbenchConfig({
      cards: [{
        key: "in_transit",
        label: "运输中",
        description: "",
        isVisible: true,
        zone: "CORE",
        sortOrder: 1,
        audience: { roleIds: ["role-sales"], departmentIds: ["dept-sales"], membershipIds: [] },
      }],
    });
    const card = config.cards.find((item) => item.key === "in_transit")!;
    expect(dashboardCardAppliesToMembership(card, { id: "member-a", roleId: "role-sales", departmentId: "dept-sales" })).toBe(true);
    expect(dashboardCardAppliesToMembership(card, { id: "member-b", roleId: "role-sales", departmentId: "dept-other" })).toBe(false);
  });
});
