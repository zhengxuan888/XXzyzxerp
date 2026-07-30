import { describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: { order: { findUnique: vi.fn() } },
}));

vi.mock("../permission", () => ({
  checkPermission: vi.fn(),
}));

import { withOrderReadScope } from "../order-access";

describe("order read scope", () => {
  it("uses the active Membership, not a shared user id, for SELF order queries", () => {
    const where = withOrderReadScope(
      { businessUnitId: "BU_A" },
      "SELF",
      {
        id: "membership-sales-a",
        userId: "same-user",
        businessUnitId: "BU_A",
        departmentId: "sales-a",
        siteId: null,
      },
    );

    expect(where).toEqual({
      AND: [
        { businessUnitId: "BU_A" },
        { ownedByMembershipId: "membership-sales-a" },
      ],
    });
    expect(JSON.stringify(where)).not.toContain("creatorUserId");
  });
});
