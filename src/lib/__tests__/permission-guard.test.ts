import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipFindFirst = vi.fn();
const menuPermissionFindMany = vi.fn();
const accessGrantFindMany = vi.fn();
const menuFindMany = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    membership: { findFirst: (...args: unknown[]) => membershipFindFirst(...args) },
    menuPermission: { findMany: (...args: unknown[]) => menuPermissionFindMany(...args) },
    accessGrant: { findMany: (...args: unknown[]) => accessGrantFindMany(...args) },
    menu: { findMany: (...args: unknown[]) => menuFindMany(...args) },
  },
}));

vi.mock("../permission", () => ({
  checkPermission: vi.fn(),
  getAllowedActionsForSession: vi.fn().mockResolvedValue(["shipment.read"]),
}));

import { getMembershipAwareMenus } from "../permission-guard";

describe("dynamic menu grant lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipFindFirst.mockResolvedValue({
      id: "m1",
      userId: "u1",
      roleId: "employee",
      businessUnitId: "BU_A",
      isActive: true,
      endedAt: null,
    });
    menuPermissionFindMany.mockResolvedValue([]);
    menuFindMany.mockResolvedValue([
      {
        id: "shipment-menu",
        key: "shipments",
        label: "Shipments",
        path: "/admin/shipments",
        icon: null,
        parentId: null,
        sortOrder: 1,
        isActive: true,
        requiredActionKey: "shipment.read",
      },
    ]);
  });

  it("opens a menu from an effective access grant", async () => {
    accessGrantFindMany.mockResolvedValue([{ actionKey: "shipment.read" }]);
    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });
    expect(menus.get(null)?.map((menu) => menu.key)).toEqual(["shipments"]);
    expect(accessGrantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, revokedAt: null }),
      }),
    );
    expect(accessGrantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessUnitId: "BU_A" }) }),
    );
  });

  it("closes the menu when no non-revoked, non-expired grant remains", async () => {
    accessGrantFindMany.mockResolvedValue([]);
    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });
    expect(menus.get(null)).toBeUndefined();
  });

  it("does not expose an empty container menu", async () => {
    menuFindMany.mockResolvedValue([
      {
        id: "group",
        key: "group-logistics",
        label: "物流与售后",
        path: "/admin/shipping",
        icon: null,
        parentId: null,
        sortOrder: 1,
        isActive: true,
        requiredActionKey: null,
      },
      {
        id: "child",
        key: "shipments",
        label: "物流追踪",
        path: "/admin/shipments",
        icon: null,
        parentId: "group",
        sortOrder: 1,
        isActive: true,
        requiredActionKey: "shipment.read",
      },
    ]);
    menuPermissionFindMany.mockResolvedValue([{ menuId: "group" }]);
    accessGrantFindMany.mockResolvedValue([]);
    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });
    expect(menus.get(null)).toBeUndefined();
  });

  it("does not expose a child through a parent with an unsupported condition", async () => {
    menuFindMany.mockResolvedValue([
      {
        id: "group",
        key: "group-logistics",
        label: "物流与售后",
        path: "/admin/shipping",
        icon: null,
        parentId: null,
        sortOrder: 1,
        isActive: true,
        requiredActionKey: null,
        requiredCondition: { featureFlag: "future-rule" },
      },
      {
        id: "child",
        key: "shipments",
        label: "物流追踪",
        path: "/admin/shipments",
        icon: null,
        parentId: "group",
        sortOrder: 1,
        isActive: true,
        requiredActionKey: "shipment.read",
        requiredCondition: null,
      },
    ]);
    menuPermissionFindMany.mockResolvedValue([{ menuId: "child" }]);
    accessGrantFindMany.mockResolvedValue([]);

    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });

    expect(menus.get(null)).toBeUndefined();
    expect(menus.get("group")?.map((menu) => menu.key)).toEqual(["shipments"]);
  });

  it("does not mistake dashboard shortcut presentation metadata for an access condition", async () => {
    menuFindMany.mockResolvedValue([
      {
        id: "orders",
        key: "orders",
        label: "订单管理",
        path: "/admin/orders",
        icon: null,
        parentId: null,
        sortOrder: 1,
        isActive: true,
        requiredActionKey: "shipment.read",
        requiredCondition: { dashboardShortcut: true, shortcutOrder: 10 },
      },
    ]);
    menuPermissionFindMany.mockResolvedValue([{ menuId: "orders" }]);
    accessGrantFindMany.mockResolvedValue([]);

    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });

    expect(menus.get(null)?.map((menu) => menu.key)).toEqual(["orders"]);
  });
});
