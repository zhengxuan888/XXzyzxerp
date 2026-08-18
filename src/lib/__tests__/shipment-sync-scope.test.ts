import { describe, expect, it } from "vitest";

import { AFTER_DELIVERY_REFUND_NOTE, MANUAL_DELIVERY_CONFIRMED_NOTE } from "@/lib/logistics/shipment-sync-policy";
import { buildShipmentSyncScope } from "@/lib/logistics/shipment-sync-scope";

describe("shipment sync scope", () => {
  it("keeps every eligible shipment instead of limiting the scope to one page", () => {
    const candidates = Array.from({ length: 14 }, (_, index) => ({
      id: `shipment-${index + 1}`,
      status: "IN_TRANSIT",
      orderExceptionNote: null,
      trackingNo: `TRACK-${index + 1}`,
      canSync: true,
    }));

    expect(buildShipmentSyncScope(candidates).shipmentIds).toHaveLength(14);
  });

  it("excludes finalized, missing-tracking and unauthorized shipments", () => {
    const result = buildShipmentSyncScope([
      { id: "active", status: "IN_TRANSIT", orderExceptionNote: null, trackingNo: "TRACK-1", canSync: true },
      { id: "closed", status: "CLOSED", orderExceptionNote: null, trackingNo: "TRACK-2", canSync: true },
      { id: "confirmed", status: "DELIVERED", orderExceptionNote: MANUAL_DELIVERY_CONFIRMED_NOTE, trackingNo: "TRACK-3", canSync: true },
      { id: "refunded", status: "DELIVERED", orderExceptionNote: AFTER_DELIVERY_REFUND_NOTE, trackingNo: "TRACK-4", canSync: true },
      { id: "missing", status: "IN_TRANSIT", orderExceptionNote: null, trackingNo: null, canSync: true },
      { id: "forbidden", status: "IN_TRANSIT", orderExceptionNote: null, trackingNo: "TRACK-5", canSync: false },
    ]);

    expect(result).toEqual({
      shipmentIds: ["active"],
      finalizedCount: 3,
      missingTrackingNoCount: 1,
    });
  });
});
