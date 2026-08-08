import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  createMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  getShip24Credential: vi.fn(),
  logisticsWorkbenchSettingFindUnique: vi.fn(),
  requireAuthContext: vi.fn(),
  track: vi.fn(),
  transaction: vi.fn(),
  translate: vi.fn(),
  txFindUnique: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireAuthContext: mocks.requireAuthContext }));
vi.mock("@/lib/permission", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/integration-credentials", () => ({ getShip24Credential: mocks.getShip24Credential }));
vi.mock("@/lib/logistics/ship24-adapter", () => ({
  DemoTrackingAdapter: class DemoTrackingAdapter {
    readonly key = "DEMO";
    track(trackingNo: string, carrier?: string) { return mocks.track(trackingNo, carrier); }
  },
  Ship24Adapter: class Ship24Adapter {
    readonly key = "SHIP24";
    track(trackingNo: string, carrier?: string) { return mocks.track(trackingNo, carrier); }
  },
}));
vi.mock("@/lib/tracking-translation-service", () => ({ translateAndCacheTrackingText: mocks.translate }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shipment: { findFirst: mocks.findFirst, findUnique: mocks.findUnique },
    logisticsWorkbenchSetting: { findUnique: mocks.logisticsWorkbenchSettingFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/mvp/shipments/[id]/sync/route";
import { AFTER_DELIVERY_REFUND_NOTE, MANUAL_DELIVERY_CONFIRMED_NOTE } from "@/lib/logistics/shipment-sync-policy";

const auth = {
  userId: "user-1",
  membership: { id: "membership-1", businessUnitId: "business-1", roleId: "role-1" },
};

function shipment(status: string, exceptionNote: string | null) {
  return {
    id: "shipment-1",
    businessUnitId: "business-1",
    status,
    trackingNo: "TRACK-1",
    carrier: "SHIP24",
    siteId: "site-1",
    order: {
      departmentId: "department-1",
      creatorUserId: "creator-1",
      ownedByMembershipId: "owner-1",
      exceptionNote,
    },
  };
}

describe("shipment sync route terminal guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuthContext.mockResolvedValue(auth);
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.translate.mockResolvedValue(null);
    mocks.logisticsWorkbenchSettingFindUnique.mockResolvedValue(null);
  });

  it.each([
    ["CLOSED", null, "CLOSED"],
    ["DELIVERED", MANUAL_DELIVERY_CONFIRMED_NOTE, "MANUAL_DELIVERY_CONFIRMED"],
    ["DELIVERED", AFTER_DELIVERY_REFUND_NOTE, "AFTER_DELIVERY_REFUND"],
  ])("rejects %s / %s before requesting a provider", async (status, exceptionNote, reason) => {
    mocks.findFirst.mockResolvedValue(shipment(status, exceptionNote));
    const response = await POST(
      new NextRequest("http://localhost/api/mvp/shipments/shipment-1/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "DEMO" }),
      }),
      { params: Promise.resolve({ id: "shipment-1" }) },
    );
    const payload = await response.json() as { error?: { details?: { reason?: string } } };

    expect(response.status).toBe(409);
    expect(payload.error?.details?.reason).toBe(reason);
    expect(mocks.getShip24Credential).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechecks inside the transaction and rolls back when confirmation wins the race", async () => {
    mocks.findFirst.mockResolvedValue(shipment("IN_TRANSIT", null));
    mocks.track.mockResolvedValue({
      trackingNo: "TRACK-1",
      events: [{
        externalEventKey: "provider-event-1",
        status: "IN_TRANSIT",
        description: "In transit",
        occurredAt: new Date("2026-08-09T00:00:00.000Z"),
      }],
    });
    mocks.findUnique.mockResolvedValue({ status: "IN_TRANSIT", order: { exceptionNote: null } });
    mocks.txFindUnique.mockResolvedValue({
      status: "DELIVERED",
      firstTrackedAt: null,
      orderId: "order-1",
      order: { exceptionNote: MANUAL_DELIVERY_CONFIRMED_NOTE },
    });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      shipment: { findUnique: mocks.txFindUnique },
      shipmentEvent: { createMany: mocks.createMany },
    }));

    const response = await POST(
      new NextRequest("http://localhost/api/mvp/shipments/shipment-1/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "DEMO" }),
      }),
      { params: Promise.resolve({ id: "shipment-1" }) },
    );
    const payload = await response.json() as { error?: { details?: { reason?: string } } };

    expect(response.status).toBe(409);
    expect(payload.error?.details?.reason).toBe("MANUAL_DELIVERY_CONFIRMED");
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
