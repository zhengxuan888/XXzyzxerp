import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  parseOrderImportWorkbook,
  validateOrderImportRows,
  type OrderImportRow,
} from "@/lib/order-batch-import";

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("订单").addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function validRow(overrides: Partial<OrderImportRow> = {}): OrderImportRow {
  return {
    row: 2,
    orderNo: "ORDER-001",
    shopId: "SHOP-1",
    customerName: "测试客户",
    phone: "13800000000",
    email: "customer@example.com",
    address: "测试地址",
    country: "CN",
    city: "深圳",
    postalCode: "518000",
    productCode: "SKU-1",
    quantity: 2,
    unitPriceCents: 1999,
    codAmountCents: 3998,
    currency: "CNY",
    paymentMethod: "COD",
    ...overrides,
  };
}

describe("order batch import", () => {
  it("recognizes a template whose first mapped header starts after column A", async () => {
    const buffer = await workbookBuffer([
      ["说明", "店铺ID", "客户姓名", "商品编码", "数量", "单价分"],
      ["忽略", "SHOP-1", "客户甲", "SKU-1", 2, 1000],
    ]);

    const rows = await parseOrderImportWorkbook(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      row: 2,
      shopId: "SHOP-1",
      customerName: "客户甲",
      productCode: "SKU-1",
      quantity: 2,
      unitPriceCents: 1000,
    });
  });

  it("skips empty spreadsheet rows instead of importing them", async () => {
    const buffer = await workbookBuffer([
      ["店铺ID", "客户姓名", "商品编码", "数量", "单价分"],
      ["SHOP-1", "客户甲", "SKU-1", 1, 100],
      ["", "", "", "", ""],
      ["SHOP-2", "客户乙", "SKU-1", 2, 200],
    ]);

    const rows = await parseOrderImportWorkbook(buffer);

    expect(rows.map((row) => row.row)).toEqual([2, 4]);
  });

  it("rejects templates missing required columns", async () => {
    const buffer = await workbookBuffer([
      ["店铺ID", "客户姓名", "商品编码"],
      ["SHOP-1", "客户甲", "SKU-1"],
    ]);

    await expect(parseOrderImportWorkbook(buffer)).rejects.toThrow("模板缺少必填列：数量、单价分");
  });

  it("reports file duplicates, existing orders and invalid money fields before commit", () => {
    const products = new Map([["sku-1", { id: "product-1", name: "测试商品" }]]);
    const rows = [
      validRow(),
      validRow({
        row: 3,
        quantity: 0,
        unitPriceCents: -1,
        codAmountCents: -1,
        currency: "CN",
      }),
    ];

    const checked = validateOrderImportRows(rows, products, new Set(["ORDER-001"]));

    expect(checked[0].errors).toEqual(expect.arrayContaining(["文件内订单号重复", "订单号已存在"]));
    expect(checked[1].errors).toEqual(expect.arrayContaining([
      "数量必须为正整数",
      "单价分必须为非负整数",
      "COD 金额分必须为非负整数",
      "币种必须为 3 位字母代码",
      "文件内订单号重复",
      "订单号已存在",
    ]));
    expect(checked[0]).toMatchObject({
      productId: "product-1",
      resolvedProductName: "测试商品",
    });
  });
});
