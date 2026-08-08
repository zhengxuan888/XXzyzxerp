import { describe, expect, it } from "vitest";

import {
  AFTER_DELIVERY_REFUND_NOTE,
  assertShipmentSyncAllowed,
  isShipmentSyncAllowed,
  MANUAL_DELIVERY_CONFIRMED_NOTE,
  shipmentSyncBlock,
  ShipmentSyncBlockedError,
} from "@/lib/logistics/shipment-sync-policy";

describe("shipment sync policy", () => {
  it.each([
    [{ status: "CLOSED", orderExceptionNote: null }, "CLOSED"],
    [{ status: "DELIVERED", orderExceptionNote: MANUAL_DELIVERY_CONFIRMED_NOTE }, "MANUAL_DELIVERY_CONFIRMED"],
    [{ status: "DELIVERED", orderExceptionNote: AFTER_DELIVERY_REFUND_NOTE }, "AFTER_DELIVERY_REFUND"],
  ] as const)("blocks terminal target %#", (target, reason) => {
    expect(isShipmentSyncAllowed(target)).toBe(false);
    expect(shipmentSyncBlock(target)).toMatchObject({ reason });
    expect(() => assertShipmentSyncAllowed(target)).toThrow(ShipmentSyncBlockedError);
  });

  it("allows provider-delivered and active shipments until a human finalizes them", () => {
    expect(isShipmentSyncAllowed({ status: "DELIVERED", orderExceptionNote: null })).toBe(true);
    expect(isShipmentSyncAllowed({ status: "IN_TRANSIT", orderExceptionNote: "人工确认成功签收-待复核" })).toBe(true);
    expect(shipmentSyncBlock({ status: "OUT_FOR_DELIVERY", orderExceptionNote: null })).toBeNull();
  });
});
