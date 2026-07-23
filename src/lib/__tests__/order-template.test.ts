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
    expect(config.customFields).toHaveLength(1);
  });

  it("only accepts configured values and reports required fields", () => {
    const fields = [{ key: "store_id", label: "店铺ID", type: "text" as const, required: true }];
    expect(sanitizeOrderCustomValues({ ignored: "x" }, fields)).toEqual({ values: {}, missing: ["店铺ID"] });
    expect(sanitizeOrderCustomValues({ store_id: "  A-1 ", ignored: "x" }, fields).values).toEqual({ store_id: "A-1" });
  });
});
