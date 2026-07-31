import { beforeEach, describe, expect, it, vi } from "vitest";

const rolePermissionFindMany = vi.fn();
const accessGrantFindMany = vi.fn();
const departmentFindMany = vi.fn();
const membershipFindMany = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    rolePermission: { findMany: (...args: unknown[]) => rolePermissionFindMany(...args) },
    accessGrant: { findMany: (...args: unknown[]) => accessGrantFindMany(...args) },
    department: { findMany: (...args: unknown[]) => departmentFindMany(...args) },
    membership: { findMany: (...args: unknown[]) => membershipFindMany(...args) },
    order: { findUnique: vi.fn() },
  },
}));

import { createOrderAccessPlan } from "../order-access";

const membership = {
  id: "manager",
  roleId: "role-manager",
  userId: "manager-user",
  businessUnitId: "bu-a",
  departmentId: "dept-a",
  siteId: null,
};

describe("order access plan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessGrantFindMany.mockResolvedValue([]);
    departmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
  });

  it("limits SUBORDINATES scope to the reporting tree and keeps it inside the current business unit", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SUBORDINATES", conditions: null }]);
    membershipFindMany.mockResolvedValue([
      { id: "manager", managerMembershipId: null },
      { id: "sales-1", managerMembershipId: "manager" },
      { id: "sales-2", managerMembershipId: "sales-1" },
      { id: "peer", managerMembershipId: null },
    ]);

    const plan = await createOrderAccessPlan({ membership });

    expect(plan.allowed).toBe(true);
    expect(plan.where).toEqual({
      OR: [{ businessUnitId: "bu-a", ownedByMembershipId: { in: ["sales-1", "sales-2"] } }],
    });
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a", siteId: null, ownerMembershipId: "sales-2" })).toBe(true);
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a", siteId: null, ownerMembershipId: "peer" })).toBe(false);
    expect(plan.allows({ businessUnitId: "bu-b", departmentId: "dept-a", siteId: null, ownerMembershipId: "sales-1" })).toBe(false);
  });

  it("includes nested departments for DEPARTMENT_TREE permissions", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "DEPARTMENT_TREE", conditions: null }]);
    departmentFindMany.mockResolvedValue([
      { id: "dept-a", parentId: null },
      { id: "dept-a1", parentId: "dept-a" },
      { id: "dept-a2", parentId: "dept-a1" },
      { id: "dept-b", parentId: null },
    ]);

    const plan = await createOrderAccessPlan({ membership });

    expect(plan.where).toEqual({
      OR: [{ businessUnitId: "bu-a", departmentId: { in: ["dept-a", "dept-a1", "dept-a2"] } }],
    });
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a2", siteId: null, ownerMembershipId: "other" })).toBe(true);
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-b", siteId: null, ownerMembershipId: "other" })).toBe(false);
  });
});
