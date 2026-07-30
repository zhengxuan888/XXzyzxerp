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

import { createFinanceAccessPlan } from "../finance/access";

const membership = {
  id: "member-finance-a",
  roleId: "role-finance",
  businessUnitId: "business-a",
  departmentId: "department-finance",
  siteId: "site-a",
};

describe("finance access plan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rolePermissionFindMany.mockResolvedValue([]);
    accessGrantFindMany.mockResolvedValue([]);
    departmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
  });

  it("allows a SITE scope to read statements and payments, but fails closed for counterparties", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SITE", conditions: null }]);

    const plan = await createFinanceAccessPlan({ membership, actionKey: "finance.statement.read" });

    expect(plan.canAccessStatements).toBe(true);
    expect(plan.canAccessPayments).toBe(true);
    expect(plan.canAccessCounterparties).toBe(false);
    expect(plan.statementWhere).toEqual({ OR: [{ businessUnitId: "business-a", siteId: "site-a" }] });
    expect(plan.paymentWhere).toEqual({ OR: [{ businessUnitId: "business-a", siteId: "site-a" }] });
    expect(plan.counterpartyWhere).toEqual({ OR: [] });
  });

  it("keeps a DEPARTMENT_TREE scope inside the configured department tree", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "DEPARTMENT_TREE", conditions: null }]);
    departmentFindMany.mockResolvedValue([
      { id: "department-finance", parentId: null },
      { id: "department-ap", parentId: "department-finance" },
      { id: "department-ap-child", parentId: "department-ap" },
      { id: "department-sales", parentId: null },
    ]);

    const plan = await createFinanceAccessPlan({ membership, actionKey: "finance.statement.read" });

    for (const departmentId of ["department-finance", "department-ap", "department-ap-child"]) {
      expect(plan.allows({
        businessUnitId: "business-a",
        departmentId,
        siteId: "site-a",
        ownerMembershipId: "other-member",
      })).toBe(true);
    }
    expect(plan.allows({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      ownerMembershipId: "other-member",
    })).toBe(false);
    expect(plan.allows({
      businessUnitId: "business-b",
      departmentId: "department-ap",
      siteId: "site-a",
      ownerMembershipId: "other-member",
    })).toBe(false);
    expect(departmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessUnitId: "business-a", isActive: true }),
    }));
  });

  it("does not let a SELF create permission stamp another department or site onto a finance record", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "SELF", conditions: null }]);

    const plan = await createFinanceAccessPlan({ membership, actionKey: "finance.statement.create" });

    expect(plan.allowsCreate({
      businessUnitId: "business-a",
      departmentId: "department-finance",
      siteId: "site-a",
      ownerMembershipId: "member-finance-a",
    })).toBe(true);
    expect(plan.allowsCreate({
      businessUnitId: "business-a",
      departmentId: "department-sales",
      siteId: "site-a",
      ownerMembershipId: "member-finance-a",
    })).toBe(false);
    expect(plan.allowsCreate({
      businessUnitId: "business-a",
      departmentId: "department-finance",
      siteId: "site-b",
      ownerMembershipId: "member-finance-a",
    })).toBe(false);
    expect(plan.allowsCreate({
      businessUnitId: "business-a",
      departmentId: "department-finance",
      siteId: "site-a",
      ownerMembershipId: "another-membership",
    })).toBe(false);
  });

  it("queries only active, non-revoked and non-expired grants in the current business context", async () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    accessGrantFindMany.mockResolvedValue([{
      scope: "BUSINESS_UNIT",
      businessUnitId: "business-a",
      departmentId: null,
      siteId: null,
    }]);

    const plan = await createFinanceAccessPlan({ membership, actionKey: "finance.payment.read", now });

    expect(plan.canAccessPayments).toBe(true);
    expect(accessGrantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        granteeMembershipId: "member-finance-a",
        actionKey: "finance.payment.read",
        businessUnitId: "business-a",
        isActive: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
    }));
  });

  it("fails closed for role permissions with conditions until a server evaluator is implemented", async () => {
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT", conditions: { country: "GR" } }]);

    const plan = await createFinanceAccessPlan({ membership, actionKey: "finance.statement.read" });

    expect(plan.allowed).toBe(false);
    expect(plan.canAccessStatements).toBe(false);
    expect(plan.canAccessCounterparties).toBe(false);
    expect(plan.canAccessPayments).toBe(false);
    expect(plan.statementWhere).toEqual({ OR: [] });
  });
});
