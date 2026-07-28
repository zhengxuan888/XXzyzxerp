import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertGrantRule, checkPermission, normalizeScope } from "../permission";

const now = new Date();
const oneHour = 60 * 60 * 1000;

const membershipFindFirst = vi.fn();
const membershipFindUnique = vi.fn();
const membershipFindMany = vi.fn();
const rolePermissionFindMany = vi.fn();
const rolePermissionFindUnique = vi.fn();
const accessGrantFindMany = vi.fn();
const delegationRuleFindUnique = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    membership: {
      findFirst: (...args: unknown[]) => membershipFindFirst(...args),
      findUnique: (...args: unknown[]) => membershipFindUnique(...args),
      findMany: (...args: unknown[]) => membershipFindMany(...args),
    },
    rolePermission: {
      findMany: (...args: unknown[]) => rolePermissionFindMany(...args),
      findUnique: (...args: unknown[]) => rolePermissionFindUnique(...args),
    },
    accessGrant: {
      findMany: (...args: unknown[]) => accessGrantFindMany(...args),
    },
    delegationRule: {
      findUnique: (...args: unknown[]) => delegationRuleFindUnique(...args),
    },
  },
}));

describe("permission utils", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizeScope handles aliases and defaults", () => {
    expect(normalizeScope("business_unit")).toBe("BUSINESS_UNIT");
    expect(normalizeScope("ALL")).toBe("ALL");
    expect(normalizeScope("invalid")).toBe("NONE");
    expect(normalizeScope(undefined)).toBe("NONE");
    expect(normalizeScope("SUBORDINATES")).toBe("SUBORDINATES");
    expect(normalizeScope("DEPARTMENT_TREE")).toBe("DEPARTMENT_TREE");
  });

  it("checkPermission allows BUSINESS_UNIT scoped role permission in same business unit", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "m1",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: "S1",
      userId: "u1",
      roleId: "role_admin",
      isActive: true,
      endedAt: null,
      role: { id: "role_admin" },
    });
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT" }]);
    accessGrantFindMany.mockResolvedValue([]);

    const result = await checkPermission({
      userId: "u1",
      membershipId: "m1",
      actionKey: "order.read",
      targetBusinessUnitId: "BU_A",
    });

    expect(result.allowed).toBe(true);
    expect(result.source).toBe("role");
    expect(result.reasons).toEqual(expect.arrayContaining(["SCOPE_BUSINESS_UNIT_OK"]));
  });

  it("checkPermission denies role permission cross business unit", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "m1",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: "S1",
      userId: "u1",
      roleId: "role_admin",
      isActive: true,
      endedAt: null,
      role: { id: "role_admin" },
    });
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT" }]);
    accessGrantFindMany.mockResolvedValue([]);

    const result = await checkPermission({
      userId: "u1",
      membershipId: "m1",
      actionKey: "order.read",
      targetBusinessUnitId: "BU_B",
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("PERMISSION_DENIED");
  });

  it("checkPermission enforces department ownership, not only business-unit ownership", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "m1",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: null,
      userId: "u1",
      roleId: "role_manager",
      isActive: true,
      endedAt: null,
      role: { id: "role_manager" },
    });
    rolePermissionFindMany.mockResolvedValue([{ scope: "DEPARTMENT" }]);
    accessGrantFindMany.mockResolvedValue([]);

    const denied = await checkPermission({
      userId: "u1",
      membershipId: "m1",
      actionKey: "customer.read",
      targetBusinessUnitId: "BU_A",
      targetDepartmentId: "D2",
    });
    expect(denied.allowed).toBe(false);
  });

  it("checkPermission allows reporting-line subordinates and rejects peers", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "manager",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: null,
      userId: "manager-user",
      roleId: "role_manager",
      isActive: true,
      endedAt: null,
      role: { id: "role_manager" },
    });
    rolePermissionFindMany.mockResolvedValue([{ scope: "SUBORDINATES" }]);
    accessGrantFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([
      { id: "manager", userId: "manager-user", managerMembershipId: null },
      { id: "direct", userId: "direct-user", managerMembershipId: "manager" },
      { id: "indirect", userId: "indirect-user", managerMembershipId: "direct" },
      { id: "peer", userId: "peer-user", managerMembershipId: null },
    ]);

    const direct = await checkPermission({
      userId: "manager-user",
      membershipId: "manager",
      actionKey: "daily_goal.manage",
      targetBusinessUnitId: "BU_A",
      targetUserId: "direct-user",
    });
    const indirect = await checkPermission({
      userId: "manager-user",
      membershipId: "manager",
      actionKey: "daily_goal.manage",
      targetBusinessUnitId: "BU_A",
      targetUserId: "indirect-user",
    });
    const peer = await checkPermission({
      userId: "manager-user",
      membershipId: "manager",
      actionKey: "daily_goal.manage",
      targetBusinessUnitId: "BU_A",
      targetUserId: "peer-user",
    });

    expect(direct.allowed).toBe(true);
    expect(indirect.allowed).toBe(true);
    expect(peer.allowed).toBe(false);
  });

  it("checkPermission accepts valid ACCESS_GRANT and rejects expired grant", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "m2",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: "S1",
      userId: "u2",
      roleId: "role_staff",
      isActive: true,
      endedAt: null,
      role: { id: "role_staff" },
    });
    rolePermissionFindMany.mockResolvedValue([]);
    accessGrantFindMany
      .mockResolvedValueOnce([
        {
          actionKey: "order.read",
          scope: "SITE",
          businessUnitId: "BU_A",
          departmentId: "D1",
          siteId: "S1",
          isActive: true,
          revokedAt: null,
          expiresAt: new Date(now.getTime() + oneHour),
        },
      ])
      .mockResolvedValueOnce([]);

    const valid = await checkPermission({
      userId: "u2",
      membershipId: "m2",
      actionKey: "order.read",
      targetBusinessUnitId: "BU_A",
      targetSiteId: "S1",
    });
    expect(valid.allowed).toBe(true);
    expect(valid.source).toBe("access_grant");
    expect(valid.reasons).toContain("SCOPE_SITE_OK");

    accessGrantFindMany.mockClear();
    accessGrantFindMany.mockResolvedValue([
      {
        actionKey: "order.read",
        scope: "SITE",
        businessUnitId: "BU_A",
        departmentId: "D1",
        siteId: "S1",
        isActive: true,
        revokedAt: null,
        expiresAt: new Date(now.getTime() - oneHour),
      },
    ]);

    const expired = await checkPermission({
      userId: "u2",
      membershipId: "m2",
      actionKey: "order.read",
      targetBusinessUnitId: "BU_A",
      targetSiteId: "S1",
    });
    expect(expired.allowed).toBe(false);
    expect(expired.reasons).toContain("PERMISSION_DENIED");
  });

  it("assertGrantRule blocks delegation beyond actor scope", async () => {
    membershipFindFirst.mockResolvedValue({
      id: "manager",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: "S1",
      userId: "u3",
      roleId: "role_manager",
      isActive: true,
      endedAt: null,
      role: { id: "role_manager" },
    });
    membershipFindUnique.mockResolvedValue({
      id: "manager",
      businessUnitId: "BU_A",
      departmentId: "D1",
      siteId: "S1",
      userId: "u3",
      roleId: "role_manager",
      isActive: true,
      endedAt: null,
      role: { id: "role_manager" },
    });
    rolePermissionFindMany.mockResolvedValue([{ scope: "BUSINESS_UNIT" }]);
    delegationRuleFindUnique.mockResolvedValue({
      id: "dr1",
      roleId: "role_manager",
      actionKey: "order.read",
      canTransfer: true,
      maxScope: "SITE",
    });
    rolePermissionFindUnique.mockResolvedValue({ scope: "SITE" });

    const result = await assertGrantRule({
      actorMembershipId: "manager",
      actorUserId: "u3",
      actionKey: "order.read",
      requestedScope: "ALL",
      target: {
        businessUnitId: "BU_A",
        departmentId: "D1",
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("SCOPE_EXCEEDS_DELEGATION");
  });
});
