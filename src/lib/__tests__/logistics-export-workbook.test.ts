import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildLogisticsExportWorkbook } from "@/lib/logistics-export-workbook";
import { ensureLogisticsExportNoteColumn } from "@/lib/logistics-export-review";
import type { LogisticsTemplateColumn } from "@/lib/logistics-provider-template";

const westColumns: LogisticsTemplateColumn[] = [
  { field: "custom:originalTrackingNo", header: "客户订单号" },
  { field: "orderNo", header: "客户订单编号" },
  { field: "shippingRoute", header: "运输渠道" },
  { field: "constant:Phone", header: "海关报关品名1" },
  { field: "constant:手机", header: "中文品名1" },
  { field: "quantity", header: "申报品数量1" },
  { field: "declarationAmount", header: "申报金额" },
  { field: "constant:EUR", header: "海关申报币种" },
  { field: "recipientName", header: "收件人姓名" },
  { field: "recipientPhone", header: "收件人电话" },
  { field: "recipientCountryCode", header: "国家代码" },
  { field: "constant:0.2", header: "重量" },
  { field: "recipientRegion", header: "收件人省份" },
  { field: "recipientCity", header: "收件人城市" },
  { field: "recipientAddress", header: "收件人地址" },
  { field: "recipientFullAddress", header: "完整原始地址（核对后删除）" },
  { field: "recipientPostalCode", header: "收件人邮编" },
  { field: "constant:1", header: "包裹件数" },
  { field: "codAmount", header: "代收金额" },
  { field: "currency", header: "代收货款币种" },
  { field: "recipientEmail", header: "收件人邮箱" },
  { field: "salesName", header: "录单员工" },
  { field: "productConfigurations", header: "具体型号配置" },
];

const eastColumns: LogisticsTemplateColumn[] = [
  { field: "custom:originalTrackingNo", header: "客户订单号" },
  { field: "orderNo", header: "客户订单编号" },
  { field: "shippingRoute", header: "运输方式" },
  { field: "recipientCountryCode", header: "目的国家" },
  { field: "recipientName", header: "收件人姓名" },
  { field: "recipientRegion", header: "收件人州省" },
  { field: "recipientDistrict", header: "收件人区" },
  { field: "recipientCity", header: "收件人城市" },
  { field: "recipientStreet", header: "收件人地址" },
  { field: "recipientHouseNumber", header: "收件人门牌号" },
  { field: "custom:streetNumber", header: "收件人街道号" },
  { field: "recipientFullAddress", header: "完整原始地址（核对后删除）" },
  { field: "recipientPhone", header: "收件人电话" },
  { field: "recipientPostalCode", header: "收件人邮编" },
  { field: "recipientEmail", header: "收件人邮箱" },
  { field: "codAmount", header: "代收货款" },
  { field: "currency", header: "代收币种" },
  { field: "constant:Phone", header: "海关报关品名1" },
  { field: "constant:手机", header: "中文品名1" },
  { field: "quantity", header: "申报品数量1" },
  { field: "declarationAmount", header: "申报价值1" },
  { field: "constant:EUR", header: "申报币种1" },
  { field: "constant:HYBH-SJ-X", header: "配货信息1" },
  { field: "salesName", header: "录单员工" },
  { field: "productConfigurations", header: "具体型号配置" },
];

const order = {
  orderNo: "ZY202689-8",
  recipientName: "Sample Receiver",
  recipientPhone: "+34 600 000 000",
  recipientEmail: "sample@example.test",
  recipientCountryCode: "ES",
  recipientPostalCode: "28009",
  recipientRegion: "Comunidad de Madrid",
  recipientCity: "Madrid",
  recipientDistrict: "Salamanca",
  recipientStreet: "Calle de Alcalá",
  recipientHouseNumber: "123, 4º B",
  recipientAddress: "Calle de Alcalá 123, 4º B",
  recipientFullAddress: "Sample Receiver, Calle de Alcalá 123, 4º B, 28009 Madrid, España",
  codAmountCents: 112_500,
  currency: "PLN",
  productValueCents: 2_600,
  declarationCurrency: "EUR",
  customerWhatsapp: "+34 600 000 000",
  note: null,
  customFields: {
    originalTrackingNo: "CUSTOMER-001",
    streetNumber: "123",
    declaredAmount: "999.99",
    declaredCurrency: "PLN",
  },
  items: [
    { productName: "iPhone 15 Pro Max 黑色 256GB", quantity: 3, unitPriceCents: 867 },
  ],
  creatorUser: { username: "sales", fullName: "录单员工" },
};

async function restoredSheet(templateCode: string, columns: LogisticsTemplateColumn[]) {
  const { output, payloads } = await buildLogisticsExportWorkbook({
    templateCode,
    sheetName: "Sheet1",
    columns,
    countryRoutes: { ES: "CT西班牙COD专线(转寄)" },
    headerFill: "FFFF00",
    headerFontColor: "000000",
    orders: [order],
  });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(new Uint8Array(output).buffer);
  return { sheet: restored.getWorksheet("Sheet1")!, payload: payloads[0]! };
}

describe("logistics export workbook", () => {
  it("writes the four approved Iberia forwarding values into D/E/G/H", async () => {
    const { sheet, payload } = await restoredSheet("HONGYA_IBERIA_FORWARD", westColumns);
    expect((sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1))
      .toEqual(westColumns.map((column) => column.header));
    expect([sheet.getCell("D1").value, sheet.getCell("E1").value, sheet.getCell("G1").value, sheet.getCell("H1").value])
      .toEqual(["海关报关品名1", "中文品名1", "申报金额", "海关申报币种"]);
    expect([sheet.getCell("D2").value, sheet.getCell("E2").value, sheet.getCell("G2").value, sheet.getCell("H2").value])
      .toEqual(["Phone", "手机", 26, "EUR"]);
    expect(sheet.getCell("G2").numFmt).toBe("0.00");
    expect(payload["7:申报金额"]).toBe(26);
    expect([sheet.getCell("P1").value, sheet.getCell("V1").value, sheet.getCell("W1").value])
      .toEqual(["完整原始地址（核对后删除）", "录单员工", "具体型号配置"]);
  });

  it("writes the four approved East-Europe forwarding values into R/S/U/V", async () => {
    const { sheet, payload } = await restoredSheet("（鸿亚）东欧转寄", eastColumns);
    expect((sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1))
      .toEqual(eastColumns.map((column) => column.header));
    expect([sheet.getCell("R1").value, sheet.getCell("S1").value, sheet.getCell("U1").value, sheet.getCell("V1").value])
      .toEqual(["海关报关品名1", "中文品名1", "申报价值1", "申报币种1"]);
    expect([sheet.getCell("R2").value, sheet.getCell("S2").value, sheet.getCell("U2").value, sheet.getCell("V2").value])
      .toEqual(["Phone", "手机", 26, "EUR"]);
    expect(sheet.getCell("U2").numFmt).toBe("0.00");
    expect(payload["21:申报价值1"]).toBe(26);
    expect([sheet.getCell("W1").value, sheet.getCell("X1").value, sheet.getCell("Y1").value])
      .toEqual(["配货信息1", "录单员工", "具体型号配置"]);
  });

  it("appends one note column after each approved layout without moving customs columns", async () => {
    const westWithNote = ensureLogisticsExportNoteColumn("HONGYA_IBERIA_FORWARD", westColumns);
    const west = await restoredSheet("HONGYA_IBERIA_FORWARD", westWithNote);
    expect(west.sheet.getCell("X1").value).toBe("录单人备注");
    expect(["D2", "E2", "G2", "H2"].map((cell) => west.sheet.getCell(cell).value))
      .toEqual(["Phone", "手机", 26, "EUR"]);

    const eastWithNote = ensureLogisticsExportNoteColumn("（鸿亚）东欧转寄", eastColumns);
    const east = await restoredSheet("（鸿亚）东欧转寄", eastWithNote);
    expect(east.sheet.getCell("Z1").value).toBe("录单人备注");
    expect(["R2", "S2", "U2", "V2"].map((cell) => east.sheet.getCell(cell).value))
      .toEqual(["Phone", "手机", 26, "EUR"]);
  });

  it("keeps an unrelated provider's legacy custom declaration columns unchanged", async () => {
    const columns: LogisticsTemplateColumn[] = [
      { field: "orderNo", header: "订单号" },
      { field: "custom:declaredAmount", header: "供应商自定义申报金额" },
      { field: "custom:declaredCurrency", header: "供应商自定义申报币种" },
      { field: "codAmount", header: "COD金额" },
    ];
    const { sheet } = await restoredSheet("FAN_RO_WMS", columns);
    expect(["A1", "B1", "C1", "D1"].map((cell) => sheet.getCell(cell).value))
      .toEqual(["订单号", "供应商自定义申报金额", "供应商自定义申报币种", "COD金额"]);
    expect(["A2", "B2", "C2", "D2"].map((cell) => sheet.getCell(cell).value))
      .toEqual(["ZY202689-8", "999.99", "PLN", "1125.00"]);
  });
});
