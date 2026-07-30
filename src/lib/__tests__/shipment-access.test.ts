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

import { createShipmentAccessPlan } from "../shipment-access";

const membership = {
  id: "member-sales-a",
  userId: "user-sales",
  roleId: "role-sales",
  businessUnitId: "business-a",
  departmentId: "department-sales",
  siteId: "site-a",
};

describe("shipment access plan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rolePermissionFindMany.mockResolvedValue([]);
    accessGrantFindMany.mockResolvedValue([]);
    departmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
  });

  it("uses the order owner Membership for SELF instead of another Membership of the same user", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SELF", conditions: null }]);

    const plan = await createShipmentAccessPlan({ membership, actionKey: "shipment.read" });

    expect(plan.allowed).toBe(true);
    expect(plan.allows({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      creatorUserId: "user-sales",
      ownerMembershipId: "member-sales-a",
    })).toBe(true);
    expect(plan.allows({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      creatorUserId: "user-sales",
      ownerMembershipId: "member-sales-b",
    })).toBe(false);
  });

  it("keeps SUBORDINATES inside the active business context and excludes peers", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SUBORDINATES", conditions: null }]);
    membershipFindMany.mockResolvedValue([
      { id: "member-sales-a", userId: "user-sales", managerMembershipId: null },
      { id: "member-sales-child", userId: "user-child", managerMembershipId: "member-sales-a" },
      { id: "member-other", userId: "user-other", managerMembershipId: null },
    ]);

    const plan = await createShipmentAccessPlan({ membership, actionKey: "shipment.read" });

    expect(plan.allows({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      creatorUserId: "user-child",
      ownerMembershipId: "member-sales-child",
    })).toBe(true);
    expect(plan.allows({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      creatorUserId: "user-other",
      ownerMembershipId: "member-other",
    })).toBe(false);
    expect(membershipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessUnitId: "business-a" }),
    }));
  });

  it("fails closed for a role permission condition until that condition has a server evaluator", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT", conditions: { country: "GR" } }]);

    const plan = await createShipmentAccessPlan({ membership, actionKey: "shipment.read" });

    expect(plan.allowed).toBe(false);
  });

  it("queries grants only for the active business context", async () => {
    await createShipmentAccessPlan({ membership, actionKey: "shipment.read" });

    expect(accessGrantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessUnitId: "business-a" }),
    }));
  });
});
