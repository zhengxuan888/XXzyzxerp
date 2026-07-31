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

import { createDocumentAccessPlan } from "../document-access";

const membership = {
  id: "manager-membership",
  userId: "manager-user",
  roleId: "role-manager",
  businessUnitId: "business-a",
  departmentId: "department-a",
  siteId: null,
};

describe("文档中心 Scope 鉴权", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rolePermissionFindMany.mockResolvedValue([]);
    accessGrantFindMany.mockResolvedValue([]);
    departmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
  });

  it("SELF 只允许当前 Membership 的新文档，并兼容本人历史文档", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SELF", conditions: null }]);
    const plan = await createDocumentAccessPlan({ membership });

    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "manager-user", ownerMembershipId: "manager-membership" })).toBe(true);
    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "manager-user", ownerMembershipId: null })).toBe(true);
    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "manager-user", ownerMembershipId: "other-membership" })).toBe(false);
  });

  it("SUBORDINATES 支持历史 ownerUserId 回退但不包含同级或跨板块", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SUBORDINATES", conditions: null }]);
    membershipFindMany.mockResolvedValue([
      { id: "manager-membership", userId: "manager-user", managerMembershipId: null },
      { id: "staff-a", userId: "staff-user", managerMembershipId: "manager-membership" },
      { id: "staff-b", userId: "staff-b-user", managerMembershipId: "staff-a" },
      { id: "peer", userId: "peer-user", managerMembershipId: null },
    ]);
    const plan = await createDocumentAccessPlan({ membership });

    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "staff-user", ownerMembershipId: "staff-a" })).toBe(true);
    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "staff-b-user", ownerMembershipId: null })).toBe(true);
    expect(plan.allows({ businessUnitId: "business-a", departmentId: "department-a", siteId: null, ownerUserId: "peer-user", ownerMembershipId: "peer" })).toBe(false);
    expect(plan.allows({ businessUnitId: "business-b", departmentId: "department-a", siteId: null, ownerUserId: "staff-user", ownerMembershipId: "staff-a" })).toBe(false);
  });

  it("带未实现条件的角色权限失败关闭", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT", conditions: { category: "contract" } }]);
    const plan = await createDocumentAccessPlan({ membership });
    expect(plan.allowed).toBe(false);
  });
});
