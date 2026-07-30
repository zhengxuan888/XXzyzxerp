import { describe, expect, it } from "vitest";

import { parseProductImportFile, validateProductImportRows } from "@/lib/product-import";

describe("product import", () => {
  it("recognizes Chinese CSV headers", async () => {
    const rows = await parseProductImportFile(
      Buffer.from("\uFEFF商品编码,商品名称,分类,单位,SKU编码,条形码\nP-1,测试商品,电子,件,S-1,690001"),
      "csv",
    );
    expect(rows).toEqual([expect.objectContaining({
      row: 2,
      productCode: "P-1",
      productName: "测试商品",
      skuCode: "S-1",
    })]);
  });

  it("separates create, skip and rejected rows", () => {
    const checked = validateProductImportRows([
      { row: 2, productCode: "NEW", productName: "新商品", category: "", unit: "", description: "", skuCode: "SKU-N", barcode: "" },
      { row: 3, productCode: "OLD", productName: "旧商品", category: "", unit: "", description: "", skuCode: "", barcode: "" },
      { row: 4, productCode: "", productName: "错误商品", category: "", unit: "", description: "", skuCode: "SKU-X", barcode: "" },
    ], new Set(["old"]), new Set());
    expect(checked.map((row) => row.action)).toEqual(["CREATE", "SKIP", "REJECT"]);
  });

  it("rejects duplicate SKU codes in the file", () => {
    const base = { productName: "商品", category: "", unit: "", description: "", barcode: "" };
    const checked = validateProductImportRows([
      { ...base, row: 2, productCode: "P1", skuCode: "SAME" },
      { ...base, row: 3, productCode: "P2", skuCode: "same" },
    ], new Set(), new Set());
    expect(checked.every((row) => row.action === "REJECT")).toBe(true);
  });
});
