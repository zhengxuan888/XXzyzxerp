import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  findFirst: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireAuthContext: mocks.requireAuthContext }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/permission", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/mvp/orders/[id]/original-address/route";

const auth = {
  userId: "user-1",
  membership: { id: "membership-1", businessUnitId: "business-1", roleId: "role-1" },
};
const order = {
  id: "order-1",
  orderNo: "ZY-1001",
  businessUnitId: "business-1",
  departmentId: "department-1",
  siteId: "order-site-1",
  creatorUserId: "creator-1",
  ownedByMembershipId: "owner-1",
  recipientFullAddress: null,
  shipments: [{ id: "shipment-1", siteId: "shipment-site-1" }],
};

function request(recipientFullAddress: unknown) {
  return new NextRequest("http://localhost/api/mvp/orders/order-1/original-address", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientFullAddress }),
  });
}

function params() {
  return { params: Promise.resolve({ id: "order-1" }) };
}

describe("one-time original address capture route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuthContext.mockResolvedValue(auth);
    mocks.findFirst.mockResolvedValue(order);
    mocks.checkPermission.mockImplementation(async ({ actionKey }: { actionKey: string }) => ({
      allowed: actionKey === "order.update",
    }));
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      order: { updateMany: mocks.updateMany },
    }));
  });

  it("requires an authenticated active membership", async () => {
    mocks.requireAuthContext.mockResolvedValue(null);

    const response = await POST(request("Customer supplied complete address"), params());

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized input without falling back to a structured address", async () => {
    const emptyResponse = await POST(request("   "), params());
    const oversizedResponse = await POST(request("a".repeat(1001)), params());

    expect(emptyResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("isolates lookup to the active business unit and hides out-of-scope orders", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await POST(request("Customer supplied complete address"), params());

    expect(response.status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", businessUnitId: "business-1" },
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires one allowed action evaluated against the complete record scope", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: false });

    const response = await POST(request("Customer supplied complete address"), params());

    expect(response.status).toBe(403);
    expect(mocks.checkPermission).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: "order.review",
      targetBusinessUnitId: "business-1",
      targetDepartmentId: "department-1",
      targetSiteId: "order-site-1",
      targetUserId: "creator-1",
      targetMembershipId: "owner-1",
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts shipment tracking permission only for a related shipment target", async () => {
    mocks.checkPermission.mockImplementation(async ({ actionKey }: { actionKey: string }) => ({
      allowed: actionKey === "shipment.track.update",
    }));

    const response = await POST(request("Customer supplied complete address"), params());

    expect(response.status).toBe(200);
    expect(mocks.checkPermission).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: "shipment.track.update",
      targetBusinessUnitId: "business-1",
      targetDepartmentId: "department-1",
      targetSiteId: "shipment-site-1",
      targetUserId: "creator-1",
      targetMembershipId: "owner-1",
    }));
  });

  it("captures once with an atomic empty-value guard and writes a redacted audit record", async () => {
    const rawAddress = "  María García, Calle de Alcalá 123, 28009 Madrid, España  ";

    const response = await POST(request(rawAddress), params());
    const payload = await response.json() as { data?: { captured?: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data?.captured).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        businessUnitId: "business-1",
        OR: [{ recipientFullAddress: null }, { recipientFullAddress: "" }],
      },
      data: { recipientFullAddress: "María García, Calle de Alcalá 123, 28009 Madrid, España" },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "order.original_address.capture",
      targetId: "order-1",
      businessUnitId: "business-1",
      details: {
        orderNo: "ZY-1001",
        characterCount: 55,
        source: "manual_one_time_capture",
      },
    }), expect.anything());
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain("Calle de Alcalá");
  });

  it("returns a conflict and never audits when another request captured first", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request("Customer supplied complete address"), params());

    expect(response.status).toBe(409);
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("never attempts to overwrite an address already present", async () => {
    mocks.findFirst.mockResolvedValue({ ...order, recipientFullAddress: "Original already stored" });

    const response = await POST(request("Replacement address"), params());

    expect(response.status).toBe(409);
    expect(mocks.checkPermission).toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
