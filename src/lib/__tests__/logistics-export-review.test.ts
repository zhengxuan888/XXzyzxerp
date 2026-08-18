import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  ORIGINAL_ADDRESS_REVIEW_HEADER,
  ORIGINAL_ADDRESS_REVIEW_NOTE,
  applyLogisticsExportPresentation,
  findLogisticsAddressReviewIssues,
  findMissingLogisticsShippingRoutes,
  logisticsBatchSnapshotRequiresOriginalAddressRemoval,
  logisticsExportColumnPresentation,
  logisticsExportFilename,
  normalizeLogisticsExportColumns,
} from "@/lib/logistics-export-review";
import {
  CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
  LEGACY_DERIVED_ADDRESS_SOURCE,
} from "@/lib/order-address";

const iberiaCode = "HONGYA_IBERIA_DROPSHIP";
const eastForwardCode = "（鸿亚）东欧转寄";

describe("Hongya logistics review exports", () => {
  it("keeps exactly one canonical original-address column beside the structured address", () => {
    const result = normalizeLogisticsExportColumns(iberiaCode, [
      { field: "orderNo", header: "客户订单号" },
      { field: "recipientFullAddress", header: "旧标题" },
      { field: "recipientAddress", header: "收件人地址" },
      { field: "recipientPhone", header: "收件人电话" },
      { field: "recipientFullAddress", header: "重复列" },
    ]);

    expect(result).toEqual([
      { field: "orderNo", header: "客户订单号" },
      { field: "recipientAddress", header: "收件人地址" },
      { field: "recipientFullAddress", header: ORIGINAL_ADDRESS_REVIEW_HEADER },
      { field: "recipientPhone", header: "收件人电话" },
    ]);
  });

  it("does not rewrite unrelated provider templates", () => {
    const columns = [{ field: "recipientFullAddress" as const, header: "供应商自定义标题" }];
    expect(normalizeLogisticsExportColumns("FAN_RO_WMS", columns)).toEqual(columns);
  });

  it("keeps the forwarding review address beside all split East-Europe address fields", () => {
    expect(normalizeLogisticsExportColumns(eastForwardCode, [
      { field: "recipientCity", header: "收件人城市" },
      { field: "recipientStreet", header: "收件人地址" },
      { field: "recipientHouseNumber", header: "收件人门牌号" },
      { field: "recipientFullAddress", header: "旧审核列" },
      { field: "custom:streetNumber", header: "收件人街道号" },
      { field: "recipientPhone", header: "收件人电话" },
    ])).toEqual([
      { field: "recipientCity", header: "收件人城市" },
      { field: "recipientStreet", header: "收件人地址" },
      { field: "recipientHouseNumber", header: "收件人门牌号" },
      { field: "custom:streetNumber", header: "收件人街道号" },
      { field: "recipientFullAddress", header: ORIGINAL_ADDRESS_REVIEW_HEADER },
      { field: "recipientPhone", header: "收件人电话" },
    ]);
  });

  it("marks review workbooks in the ASCII-safe filename without changing ordinary exports", () => {
    expect(logisticsExportFilename(iberiaCode, "2026-08-09")).toBe(
      "HONGYA_IBERIA_DROPSHIP-REVIEW-INCLUDES-ORIGINAL-ADDRESS-2026-08-09.xlsx",
    );
    expect(logisticsExportFilename(eastForwardCode, "2026-08-09")).toBe(
      "HONGYA_EAST_EU_FORWARD-REVIEW-INCLUDES-ORIGINAL-ADDRESS-2026-08-09.xlsx",
    );
    expect(logisticsExportFilename("FAN_RO_WMS", "2026-08-09")).toBe("FAN_RO_WMS-2026-08-09.xlsx");
  });

  it("returns the conspicuous presentation only for the original-address column", () => {
    expect(logisticsExportColumnPresentation(iberiaCode, "recipientFullAddress")).toMatchObject({
      width: 48,
      wrapText: true,
      headerFill: "E11D48",
      headerFontColor: "FFFFFF",
      bodyFill: "FFF1F2",
      note: ORIGINAL_ADDRESS_REVIEW_NOTE,
    });
    expect(logisticsExportColumnPresentation(iberiaCode, "recipientAddress")).toEqual({
      width: 36,
      wrapText: true,
      headerFill: null,
      headerFontColor: null,
      bodyFill: null,
      note: null,
    });
    expect(logisticsExportColumnPresentation(iberiaCode, "recipientStreet")).toMatchObject({ width: 30, wrapText: true });
    expect(logisticsExportColumnPresentation(iberiaCode, "recipientHouseNumber")).toMatchObject({ width: 20, wrapText: true });
    expect(logisticsExportColumnPresentation(iberiaCode, "productConfigurations")).toMatchObject({ width: 40, wrapText: true });
  });

  it("writes the review presentation into a real xlsx workbook", async () => {
    const columns = normalizeLogisticsExportColumns(iberiaCode, [
      { field: "orderNo", header: "客户订单号" },
      { field: "recipientAddress", header: "收件人地址" },
    ]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.field }));
    sheet.addRow(["ZY-001", "Calle de Alcala 123", "Maria, Calle de Alcala 123, 28009 Madrid, Espana"]);
    applyLogisticsExportPresentation(sheet, columns, iberiaCode);

    const serialized = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(serialized);
    const restoredSheet = restored.getWorksheet("Sheet1");
    expect(restoredSheet).toBeDefined();
    const reviewColumnIndex = columns.findIndex((column) => column.field === "recipientFullAddress") + 1;
    const headerCell = restoredSheet!.getCell(1, reviewColumnIndex);
    const valueCell = restoredSheet!.getCell(2, reviewColumnIndex);

    expect(headerCell.value).toBe(ORIGINAL_ADDRESS_REVIEW_HEADER);
    expect(restoredSheet!.getColumn(reviewColumnIndex).width).toBe(48);
    expect(headerCell.alignment.wrapText).toBe(true);
    expect(valueCell.alignment.wrapText).toBe(true);
    expect(headerCell.fill).toMatchObject({ type: "pattern", fgColor: { argb: "FFE11D48" } });
    expect(valueCell.fill).toMatchObject({ type: "pattern", fgColor: { argb: "FFFFF1F2" } });
    expect(headerCell.font.color).toEqual({ argb: "FFFFFFFF" });
    expect(headerCell.note).toBe(ORIGINAL_ADDRESS_REVIEW_NOTE);
  });

  it("preserves custom original-address presentation for unrelated templates", () => {
    const columns = [{ field: "recipientFullAddress" as const, header: "供应商自定义标题" }];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.field }));
    sheet.addRow(["Original address"]);

    applyLogisticsExportPresentation(sheet, columns, "FAN_RO_WMS");

    expect(sheet.getCell("A1").value).toBe("供应商自定义标题");
    expect(sheet.getCell("A1").fill).toBeUndefined();
    expect(sheet.getCell("A2").fill).toBeUndefined();
    expect(sheet.getColumn(1).width).toBe(18);
  });

  it("rejects incomplete Hongya addresses while leaving region optional", () => {
    const issues = findLogisticsAddressReviewIssues(iberiaCode, [
      {
        orderNo: "ZY-OK",
        recipientName: "Maria",
        recipientPhone: "+34 600 000 000",
        recipientCountryCode: "ES",
        recipientCity: "Madrid",
        recipientPostalCode: "28009",
        recipientAddress: "Calle de Alcala 123",
        recipientFullAddress: "Maria, Calle de Alcala 123, 28009 Madrid, Espana",
        recipientFullAddressSource: CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
      },
      {
        orderNo: "ZY-MISSING",
        recipientName: "Joao",
        recipientPhone: " ",
        recipientCountryCode: "PT",
        recipientCity: "",
        recipientPostalCode: "1100-053",
        recipientAddress: "Rua Augusta 88",
        recipientFullAddress: null,
        recipientFullAddressSource: null,
      },
    ]);

    expect(issues).toEqual([{
      orderNo: "ZY-MISSING",
      missingFields: ["收件人电话", "收件人城市", "完整原始地址（需补录客户原文）"],
    }]);
  });

  it("rejects a non-empty legacy derived address until customer text is captured", () => {
    expect(findLogisticsAddressReviewIssues(iberiaCode, [{
      orderNo: "ZY-LEGACY",
      recipientName: "Maria",
      recipientPhone: "+34 600 000 000",
      recipientCountryCode: "ES",
      recipientCity: "Madrid",
      recipientPostalCode: "28009",
      recipientAddress: "Calle de Alcala 123",
      recipientFullAddress: "Calle de Alcala 123",
      recipientFullAddressSource: LEGACY_DERIVED_ADDRESS_SOURCE,
    }])).toEqual([{
      orderNo: "ZY-LEGACY",
      missingFields: ["完整原始地址（需补录客户原文）"],
    }]);
  });

  it("requires every exported structured address field except the optional district", () => {
    const columns = [
      { field: "recipientRegion" as const, header: "收件人州/省" },
      { field: "recipientDistrict" as const, header: "收件人区/县" },
      { field: "recipientStreet" as const, header: "收件人街道" },
      { field: "recipientHouseNumber" as const, header: "收件人门牌号" },
    ];
    expect(findLogisticsAddressReviewIssues(iberiaCode, [{
      orderNo: "ZY-STRUCTURED",
      recipientName: "Maria",
      recipientPhone: "+34 600 000 000",
      recipientCountryCode: "ES",
      recipientRegion: null,
      recipientCity: "Madrid",
      recipientDistrict: null,
      recipientStreet: "",
      recipientHouseNumber: null,
      recipientPostalCode: "28009",
      recipientAddress: "地址待核对",
      recipientFullAddress: "Maria, 地址待核对, 28009 Madrid, Espana",
      recipientFullAddressSource: CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
    }], columns)).toEqual([{
      orderNo: "ZY-STRUCTURED",
      missingFields: ["收件人州/省", "收件人街道", "收件人门牌号/楼层房号"],
    }]);
  });

  it("accepts safely parsed legacy street fields without mutating the old order", () => {
    const columns = [
      { field: "recipientRegion" as const, header: "收件人州/省" },
      { field: "recipientStreet" as const, header: "收件人街道" },
      { field: "recipientHouseNumber" as const, header: "收件人门牌号" },
    ];
    expect(findLogisticsAddressReviewIssues(iberiaCode, [{
      orderNo: "ZY-LEGACY-PARSED",
      recipientName: "Maria",
      recipientPhone: "+34 600 000 000",
      recipientCountryCode: "ES",
      recipientRegion: "Comunidad de Madrid",
      recipientCity: "Madrid",
      recipientStreet: null,
      recipientHouseNumber: null,
      recipientPostalCode: "28009",
      recipientAddress: "Calle de Alcalá 123, 4º B",
      recipientFullAddress: "María García, Calle de Alcalá 123, 4º B, 28009 Madrid, España",
      recipientFullAddressSource: CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
    }], columns)).toEqual([]);
  });

  it("does not apply Hongya address validation to unrelated templates", () => {
    expect(findLogisticsAddressReviewIssues("FAN_RO_WMS", [{
      orderNo: "FAN-1",
      recipientName: null,
      recipientPhone: null,
      recipientCountryCode: null,
      recipientCity: null,
      recipientPostalCode: null,
      recipientAddress: null,
      recipientFullAddress: null,
      recipientFullAddressSource: null,
    }])).toEqual([]);
  });

  it("rejects countries without a configured route when the workbook exports shippingRoute", () => {
    const columns = [
      { field: "orderNo" as const, header: "订单号" },
      { field: "shippingRoute" as const, header: "运输方式" },
    ];
    expect(findMissingLogisticsShippingRoutes(columns, { ES: "CT西班牙COD专线" }, [
      { orderNo: "ZY-ES", recipientCountryCode: "es" },
      { orderNo: "ZY-PT", recipientCountryCode: "PT" },
      { orderNo: "ZY-EMPTY", recipientCountryCode: null },
    ])).toEqual([
      { orderNo: "ZY-PT", countryCode: "PT" },
      { orderNo: "ZY-EMPTY", countryCode: "未填写国家" },
    ]);
    expect(findMissingLogisticsShippingRoutes(
      [{ field: "orderNo", header: "订单号" }],
      {},
      [{ orderNo: "ZY-ANY", recipientCountryCode: null }],
    )).toEqual([]);
  });

  it("detects whether a saved batch artifact requires address-column removal confirmation", () => {
    expect(logisticsBatchSnapshotRequiresOriginalAddressRemoval({
      configuration: { columns: [{ field: "recipientAddress" }, { field: "recipientFullAddress" }] },
    })).toBe(true);
    expect(logisticsBatchSnapshotRequiresOriginalAddressRemoval({
      configuration: { columns: [{ field: "recipientAddress" }] },
    })).toBe(false);
    expect(logisticsBatchSnapshotRequiresOriginalAddressRemoval(null)).toBe(false);
  });
});
