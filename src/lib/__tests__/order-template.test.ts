import { describe, expect, it } from "vitest";
import { parseOrderTemplateConfiguration, sanitizeOrderCustomValues } from "@/lib/order-template";

describe("order templates", () => {
  it("uses safe defaults and drops invalid custom fields", () => {
    const config = parseOrderTemplateConfiguration({
      currency: "eur",
      defaultShippingFeeCents: -1,
      customFields: [{ key: "store_id", label: "店铺ID", type: "text", required: true }, { key: "../x", label: "坏字段" }],
    });
    expect(config.currency).toBe("EUR");
    expect(config.defaultShippingFeeCents).toBe(0);
    expect(config.requireSku).toBe(false);
    expect(config.customFields).toHaveLength(1);
  });

  it("only accepts configured values and reports required fields", () => {
    const fields = [{ key: "store_id", label: "店铺ID", type: "text" as const, required: true }];
    expect(sanitizeOrderCustomValues({ ignored: "x" }, fields)).toEqual({ values: {}, missing: ["店铺ID"] });
    expect(sanitizeOrderCustomValues({ store_id: "  A-1 ", ignored: "x" }, fields).values).toEqual({ store_id: "A-1" });
  });

  it("sanitizes configurable review reasons without hard-coded workflow branches", () => {
    const config = parseOrderTemplateConfiguration({
      reviewRejectReasons: [" 地址错误 ", "地址错误", "", 123, "客户未确认"],
      voidReasons: ["重复订单"],
    });
    expect(config.reviewRejectReasons).toEqual(["地址错误", "客户未确认"]);
    expect(config.voidReasons).toEqual(["重复订单"]);
  });
});
