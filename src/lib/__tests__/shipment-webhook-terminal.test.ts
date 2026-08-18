import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findMany: vi.fn(),
  getShip24Credential: vi.fn(),
  logisticsWorkbenchSettingFindUnique: vi.fn(),
  transaction: vi.fn(),
  txFindUnique: vi.fn(),
}));

vi.mock("@/lib/integration-credentials", () => ({ getShip24Credential: mocks.getShip24Credential }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shipment: { findMany: mocks.findMany },
    logisticsWorkbenchSetting: { findUnique: mocks.logisticsWorkbenchSettingFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/webhooks/ship24/route";
import { MANUAL_DELIVERY_CONFIRMED_NOTE } from "@/lib/logistics/shipment-sync-policy";

describe("Ship24 webhook terminal guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.logisticsWorkbenchSettingFindUnique.mockResolvedValue(null);
  });

  it("acknowledges a finalized shipment without opening a write transaction", async () => {
    const secret = "webhook-secret";
    const raw = JSON.stringify({
      data: {
        trackingNumber: "TRACK-1",
        eventId: "event-1",
        status: "DELIVERED",
      },
    });
    mocks.findMany.mockResolvedValue([{
      id: "shipment-1",
      businessUnitId: "business-1",
      status: "DELIVERED",
      order: { exceptionNote: MANUAL_DELIVERY_CONFIRMED_NOTE },
    }]);
    mocks.getShip24Credential.mockResolvedValue({ webhookSecret: secret });

    const response = await POST(new NextRequest("http://localhost/api/webhooks/ship24", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ship24-signature": createHmac("sha256", secret).update(raw).digest("hex"),
      },
      body: raw,
    }));
    const payload = await response.json() as { ignored?: boolean; reason?: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ignored: true, reason: "MANUAL_DELIVERY_CONFIRMED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechecks the target before createMany when finalization races with a webhook", async () => {
    const secret = "webhook-secret";
    const raw = JSON.stringify({
      data: {
        trackingNumber: "TRACK-1",
        eventId: "event-2",
        status: "IN_TRANSIT",
      },
    });
    mocks.findMany.mockResolvedValue([{
      id: "shipment-1",
      businessUnitId: "business-1",
      status: "IN_TRANSIT",
      order: { exceptionNote: null },
    }]);
    mocks.getShip24Credential.mockResolvedValue({ webhookSecret: secret });
    mocks.txFindUnique.mockResolvedValue({
      status: "DELIVERED",
      orderId: "order-1",
      order: { exceptionNote: MANUAL_DELIVERY_CONFIRMED_NOTE },
    });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      shipment: { findUnique: mocks.txFindUnique },
      shipmentEvent: { createMany: mocks.createMany },
    }));

    const response = await POST(new NextRequest("http://localhost/api/webhooks/ship24", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ship24-signature": createHmac("sha256", secret).update(raw).digest("hex"),
      },
      body: raw,
    }));
    const payload = await response.json() as { ignored?: boolean; reason?: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ignored: true, reason: "MANUAL_DELIVERY_CONFIRMED" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
