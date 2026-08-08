import { describe, expect, it } from "vitest";

import { classifyLogisticsColorTags, parseLogisticsColorTagKeys } from "@/lib/logistics-color-tags";

describe("logistics color tags", () => {
  it("combines system state, ETA, events, quick tags and post-delivery exceptions", () => {
    expect(classifyLogisticsColorTags({
      status: "IN_TRANSIT",
      estimatedDeliveryAt: "2026-08-09T08:00:00.000Z",
      orderExceptionNote: "签收后退款",
      signals: ["EVENT:REFUSED", "TAG:已读不回", "TAG:派送失败"],
      now: new Date("2026-08-08T04:00:00.000Z"),
    })).toEqual(["transporting", "delivery_soon", "read_no_reply", "delivery_failed", "post_delivery_exception"]);
    expect(classifyLogisticsColorTags({
      status: "EXCEPTION",
      latestEventType: "REFUSED",
    })).toEqual(["refused"]);
  });

  it("keeps terminal shipments out of the ETA color and parses several filters safely", () => {
    expect(classifyLogisticsColorTags({
      status: "DELIVERED",
      estimatedDeliveryAt: "2026-08-08T08:00:00.000Z",
      now: new Date("2026-08-08T04:00:00.000Z"),
    })).toEqual(["delivered"]);
    expect(parseLogisticsColorTagKeys("delivered,refused,delivered,unknown")).toEqual(["delivered", "refused"]);
  });

  it("does not let historical stages override the current shipment state", () => {
    expect(classifyLogisticsColorTags({
      status: "DELIVERED",
      signals: ["EVENT:OUT_FOR_DELIVERY", "TAG:派送中", "TAG:已读不回"],
      latestEventType: "DELIVERED",
    })).toEqual(["delivered", "read_no_reply"]);
    expect(classifyLogisticsColorTags({
      status: "OUT_FOR_DELIVERY",
      latestEventType: "READY_FOR_PICKUP",
    })).toEqual(["ready_for_pickup"]);
  });

  it("uses the Asia/Shanghai calendar day for today and tomorrow", () => {
    expect(classifyLogisticsColorTags({
      status: "IN_TRANSIT",
      now: new Date("2026-08-08T16:30:00.000Z"),
      estimatedDeliveryAt: "2026-08-09T16:10:00.000Z",
    })).toContain("delivery_soon");
    expect(classifyLogisticsColorTags({
      status: "IN_TRANSIT",
      now: new Date("2026-08-08T16:30:00.000Z"),
      estimatedDeliveryAt: "2026-08-10T16:10:00.000Z",
    })).not.toContain("delivery_soon");
  });
});
