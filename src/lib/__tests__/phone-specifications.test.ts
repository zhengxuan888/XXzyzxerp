import { describe, expect, it } from "vitest";

import { phoneVariantNames } from "../phone-specifications";

describe("phoneVariantNames", () => {
  it("creates every Samsung S23 Ultra color and capacity combination", () => {
    const variants = phoneVariantNames("Samsung S23 ultra");
    expect(variants).toHaveLength(24);
    expect(variants).toContainEqual({
      color: "黑色",
      capacity: "256GB",
      name: "Samsung S23 ultra 黑色 256GB",
    });
    expect(variants.some((variant) => variant.name === "Samsung S23 ultra 天蓝色 1TB")).toBe(true);
  });

  it("matches model names regardless of spaces or letter case", () => {
    expect(phoneVariantNames("iPhone15promax")).toHaveLength(12);
    expect(phoneVariantNames("IPHONE 15 PRO MAX")).toHaveLength(12);
  });

  it("does not create variants for unrelated products", () => {
    expect(phoneVariantNames("普通商品")).toEqual([]);
  });
});
