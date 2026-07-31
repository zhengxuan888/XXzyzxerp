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
  },
}));

import { createResourceAccessPlan } from "../resource-access";

const membership = {
  id: "manager",
  roleId: "role-manager",
  userId: "manager-user",
  businessUnitId: "bu-a",
  departmentId: "dept-a",
  siteId: null,
};

describe("资源中心 Scope 鉴权", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessGrantFindMany.mockResolvedValue([]);
    departmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
  });

  it("SUBORDINATES 只能访问直接与间接下属资源，不能跨业务板块", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SUBORDINATES", conditions: null }]);
    membershipFindMany.mockResolvedValue([
      { id: "manager", managerMembershipId: null },
      { id: "sales-1", managerMembershipId: "manager" },
      { id: "sales-2", managerMembershipId: "sales-1" },
      { id: "peer", managerMembershipId: null },
    ]);

    const plan = await createResourceAccessPlan({ membership });

    expect(plan.where).toEqual({
      OR: [{ businessUnitId: "bu-a", assignedMembershipId: { in: ["sales-1", "sales-2"] } }],
    });
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a", siteId: null, assignedMembershipId: "sales-2" })).toBe(true);
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a", siteId: null, assignedMembershipId: "peer" })).toBe(false);
    expect(plan.allows({ businessUnitId: "bu-b", departmentId: "dept-a", siteId: null, assignedMembershipId: "sales-1" })).toBe(false);
  });

  it("DEPARTMENT_TREE 只覆盖本部门及其下级部门", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "DEPARTMENT_TREE", conditions: null }]);
    departmentFindMany.mockResolvedValue([
      { id: "dept-a", parentId: null },
      { id: "dept-a1", parentId: "dept-a" },
      { id: "dept-a2", parentId: "dept-a1" },
      { id: "dept-b", parentId: null },
    ]);

    const plan = await createResourceAccessPlan({ membership });

    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-a2", siteId: null, assignedMembershipId: null })).toBe(true);
    expect(plan.allows({ businessUnitId: "bu-a", departmentId: "dept-b", siteId: null, assignedMembershipId: null })).toBe(false);
  });
});
