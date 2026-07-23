import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipFindUnique = vi.fn();
const menuPermissionFindMany = vi.fn();
const accessGrantFindMany = vi.fn();
const menuFindMany = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    membership: { findUnique: (...args: unknown[]) => membershipFindUnique(...args) },
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
    membershipFindUnique.mockResolvedValue({ id: "m1", roleId: "employee" });
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
  });

  it("closes the menu when no non-revoked, non-expired grant remains", async () => {
    accessGrantFindMany.mockResolvedValue([]);
    const menus = await getMembershipAwareMenus({ membershipId: "m1", userId: "u1" });
    expect(menus.get(null)).toBeUndefined();
  });
});
