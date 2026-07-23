import { describe, expect, it } from "vitest";

import { consolidateSkuQuantities, InventoryError } from "../inventory";

describe("inventory invariants", () => {
  it("consolidates repeated SKUs before an atomic reservation", () => {
    expect(
      consolidateSkuQuantities([
        { skuId: "sku-a", quantity: 2 },
        { skuId: "sku-a", quantity: 3 },
        { skuId: "sku-b", quantity: 1 },
      ]),
    ).toEqual([
      { skuId: "sku-a", quantity: 5 },
      { skuId: "sku-b", quantity: 1 },
    ]);
  });

  it("never silently skips a missing SKU", () => {
    expect(() => consolidateSkuQuantities([{ skuId: null, quantity: 1 }])).toThrowError(InventoryError);
  });

  it("rejects zero, negative, fractional, and unsafe quantities", () => {
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => consolidateSkuQuantities([{ skuId: "sku-a", quantity }])).toThrowError(InventoryError);
    }
  });
});
