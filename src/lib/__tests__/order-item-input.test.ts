import { describe, expect, it } from "vitest";

import { parseOrderItems, parseSingleOrderItem } from "@/lib/order-item-input";

describe("sales order item input", () => {
  it("accepts the real one-page ecommerce payload without a fixed customer record", () => {
    expect(parseSingleOrderItem({
      productName: "手打产品名称",
      quantity: 1,
      unitPriceCents: 2999,
      skuId: "",
    })).toEqual([{
      productId: null,
      productName: "手打产品名称",
      quantity: 1,
      unitPriceCents: 2999,
      skuId: null,
    }]);
  });

  it("preserves a catalog product/SKU link when the template requires stock control", () => {
    expect(parseOrderItems([{
      productId: "product-1",
      productName: "库存商品",
      quantity: 2,
      unitPriceCents: 100,
      skuId: "sku-1",
    }])).toEqual([{
      productId: "product-1",
      productName: "库存商品",
      quantity: 2,
      unitPriceCents: 100,
      skuId: "sku-1",
    }]);
  });

  it("rejects incomplete or unsafe item values", () => {
    expect(parseSingleOrderItem({ productName: "", quantity: 1, unitPriceCents: 1 })).toEqual([]);
    expect(parseSingleOrderItem({ productName: "产品", quantity: 0, unitPriceCents: 1 })).toEqual([]);
    expect(parseSingleOrderItem({ productName: "产品", quantity: 1, unitPriceCents: -1 })).toEqual([]);
  });
});
