import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipFindMany = vi.fn();
const departmentFindMany = vi.fn();
const checkPermission = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    membership: { findMany: (...args: unknown[]) => membershipFindMany(...args) },
    department: { findMany: (...args: unknown[]) => departmentFindMany(...args) },
  },
}));

vi.mock("../permission", () => ({
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));

import { getTeamGoalAccess } from "../team-goal-access";

describe("team goal access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    membershipFindMany.mockResolvedValue([
      { id: "manager", userId: "u-manager", departmentId: "d-sales", siteId: null },
      { id: "seller", userId: "u-seller", departmentId: "d-sales", siteId: null },
      { id: "other", userId: "u-other", departmentId: "d-finance", siteId: null },
    ]);
    departmentFindMany.mockResolvedValue([
      { id: "d-sales", name: "销售" },
      { id: "d-finance", name: "财务" },
    ]);
  });

  it("does not turn a subordinates grant into a department or business-unit aggregate", async () => {
    checkPermission.mockImplementation((context: Record<string, unknown>) => ({
      allowed: context.targetMembershipId === "seller",
      reasons: context.targetMembershipId === "seller" ? ["SCOPE_SUBORDINATES_OK"] : ["PERMISSION_DENIED"],
    }));

    const result = await getTeamGoalAccess({
      id: "manager",
      userId: "u-manager",
      businessUnitId: "bu-1",
    });

    expect(result.readableMembershipIds).toEqual(new Set(["seller"]));
    expect(result.readableDepartmentIds).toEqual(new Set());
    expect(result.canReadBusinessUnit).toBe(false);
    expect(result.manageableDepartmentIds).toEqual(new Set());
    expect(result.canManageBusinessUnit).toBe(false);
    expect(checkPermission).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: "team_goal.read",
      targetBusinessUnitId: "bu-1",
      allowedScopes: ["ALL", "BUSINESS_UNIT"],
    }));
    expect(checkPermission).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: "team_goal.read",
      targetDepartmentId: "d-sales",
      allowedScopes: ["ALL", "BUSINESS_UNIT", "DEPARTMENT", "DEPARTMENT_TREE"],
    }));
  });

  it("permits a business-unit goal only when the corresponding wide scope is granted", async () => {
    checkPermission.mockImplementation((context: Record<string, unknown>) => ({
      allowed: Array.isArray(context.allowedScopes) && context.allowedScopes.includes("BUSINESS_UNIT"),
      reasons: ["SCOPE_BUSINESS_UNIT_OK"],
    }));

    const result = await getTeamGoalAccess({
      id: "manager",
      userId: "u-manager",
      businessUnitId: "bu-1",
    });

    expect(result.canReadBusinessUnit).toBe(true);
    expect(result.canManageBusinessUnit).toBe(true);
    expect(result.readableDepartmentIds).toEqual(new Set(["d-sales", "d-finance"]));
    expect(result.manageableDepartmentIds).toEqual(new Set(["d-sales", "d-finance"]));
  });
});
