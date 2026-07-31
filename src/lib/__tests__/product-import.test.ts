import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  analyzeProductImportFile,
  parseProductImportFile,
  summarizeProductImportRows,
  validateProductImportRows,
} from "@/lib/product-import";

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

  it("scans every worksheet and header row instead of assuming the first sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("说明").addRow(["这是说明页"]);
    const data = workbook.addWorksheet("商品资料");
    data.addRow(["择优臻选商品清单"]);
    data.addRow([]);
    data.addRow(["产品编号", "产品名称", "SKU", "条码"]);
    data.addRow(["P-1", "测试商品", "SKU-1", "690001"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const analysis = await analyzeProductImportFile(bytes, "xlsx");
    expect(analysis.detection.selected).toMatchObject({ sheetName: "商品资料", headerRow: 3 });
    expect(analysis.rows).toEqual([expect.objectContaining({ row: 4, productCode: "P-1", skuCode: "SKU-1" })]);
  });

  it("requires a human selection when two sheets match equally", async () => {
    const workbook = new ExcelJS.Workbook();
    for (const sheetName of ["Sheet A", "Sheet B"]) {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(["商品编码", "商品名称"]);
      sheet.addRow([sheetName, "测试商品"]);
    }
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const ambiguous = await analyzeProductImportFile(bytes, "xlsx");
    expect(ambiguous.detection.requiresSelection).toBe(true);
    const selected = await analyzeProductImportFile(bytes, "xlsx", { sheetName: "Sheet B", headerRow: 1 });
    expect(selected.detection.requiresSelection).toBe(false);
    expect(selected.rows[0].productCode).toBe("Sheet B");
  });

  it("does not trust an XLSX extension when the file is not a workbook", async () => {
    await expect(analyzeProductImportFile(Buffer.from("not an xlsx workbook"), "xlsx"))
      .rejects.toThrow("文件扩展名为 XLSX");
  });

  it("separates product creation, SKU creation, skip and rejected rows", () => {
    const checked = validateProductImportRows([
      { row: 2, productCode: "NEW", productName: "新商品", category: "", unit: "", description: "", skuCode: "SKU-N", barcode: "" },
      { row: 3, productCode: "NEW", productName: "新商品", category: "", unit: "", description: "", skuCode: "SKU-N-2", barcode: "" },
      { row: 4, productCode: "OLD", productName: "旧商品", category: "", unit: "", description: "", skuCode: "SKU-OLD-2", barcode: "" },
      { row: 5, productCode: "", productName: "错误商品", category: "", unit: "", description: "", skuCode: "SKU-X", barcode: "" },
    ], new Map([
      ["old", { id: "old-id", code: "OLD", name: "旧商品", skus: [{ code: "SKU-OLD" }] }],
    ]));
    expect(checked.map((row) => row.action)).toEqual(["CREATE_PRODUCT", "CREATE_SKU", "CREATE_SKU", "REJECT"]);
    expect(summarizeProductImportRows(checked)).toMatchObject({ productsToCreate: 1, skusToCreate: 3, reject: 1 });
  });

  it("rejects inconsistent duplicate product data and duplicate SKU within the same product", () => {
    const base = { category: "", unit: "", description: "", barcode: "" };
    const inconsistent = validateProductImportRows([
      { ...base, row: 2, productCode: "P1", productName: "商品 A", skuCode: "S-1" },
      { ...base, row: 3, productCode: "P1", productName: "商品 B", skuCode: "S-2" },
    ], new Map());
    expect(inconsistent.every((row) => row.action === "REJECT")).toBe(true);

    const duplicateSku = validateProductImportRows([
      { ...base, row: 2, productCode: "P1", productName: "商品", skuCode: "SAME" },
      { ...base, row: 3, productCode: "P1", productName: "商品", skuCode: "same" },
    ], new Map());
    expect(duplicateSku.every((row) => row.action === "REJECT")).toBe(true);
  });
});
