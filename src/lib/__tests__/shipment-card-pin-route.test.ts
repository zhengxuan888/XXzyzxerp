import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: vi.fn(),
  upsert: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireAuthContext: mocks.requireAuthContext }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/permission", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shipment: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/mvp/shipments/[id]/pin/route";

const auth = {
  userId: "user-1",
  membership: { id: "membership-1", businessUnitId: "business-1", roleId: "role-1" },
};
const shipment = {
  id: "shipment-1",
  businessUnitId: "business-1",
  siteId: "site-1",
  order: {
    departmentId: "department-1",
    creatorUserId: "creator-1",
    ownedByMembershipId: "owner-1",
  },
};

function request(pinned: boolean) {
  return new NextRequest("http://localhost/api/mvp/shipments/shipment-1/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
}

describe("shipment card pin route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuthContext.mockResolvedValue(auth);
    mocks.findFirst.mockResolvedValue(shipment);
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      shipmentCardPin: {
        findUnique: mocks.findUnique,
        upsert: mocks.upsert,
        deleteMany: mocks.deleteMany,
      },
    }));
  });

  it("protects the operation with the shipment.read scope", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    const response = await POST(request(true), { params: Promise.resolve({ id: "shipment-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.checkPermission).toHaveBeenCalledWith(expect.objectContaining({
      membershipId: "membership-1",
      actionKey: "shipment.read",
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a personal pin and returns its persisted timestamp", async () => {
    const pinnedAt = new Date("2026-08-09T03:00:00.000Z");
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ pinnedAt });

    const response = await POST(request(true), { params: Promise.resolve({ id: "shipment-1" }) });
    const payload = await response.json() as { data?: { pinned?: boolean; pinnedAt?: string } };

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      shipmentId: "shipment-1",
      pinned: true,
      pinnedAt: pinnedAt.toISOString(),
    });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        membershipId_shipmentId: { membershipId: "membership-1", shipmentId: "shipment-1" },
      },
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "shipment.card.pin",
      details: { pinned: true, changed: true },
    }), expect.anything());
  });

  it("uses idempotent deleteMany when two tabs cancel the same pin", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(false), { params: Promise.resolve({ id: "shipment-1" }) });
    const payload = await response.json() as { data?: { pinned?: boolean; pinnedAt?: null } };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ pinned: false, pinnedAt: null });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: "membership-1", shipmentId: "shipment-1" },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "shipment.card.unpin",
      details: { pinned: false, changed: false },
    }), expect.anything());
  });
});
