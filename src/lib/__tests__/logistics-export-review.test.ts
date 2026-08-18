import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  ORIGINAL_ADDRESS_REVIEW_HEADER,
  ORIGINAL_ADDRESS_REVIEW_NOTE,
  applyLogisticsExportPresentation,
  ensureLogisticsExportNoteColumn,
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

describe("Hongya logistics review exports", () => {
  it("adds the order-entry note to every export without duplicating configured note columns", () => {
    expect(ensureLogisticsExportNoteColumn([
      { field: "orderNo", header: "订单号" },
    ])).toEqual([
      { field: "orderNo", header: "订单号" },
      { field: "note", header: "录单人备注" },
    ]);
    expect(ensureLogisticsExportNoteColumn([
      { field: "orderNo", header: "订单号" },
      { field: "note", header: "供应商备注" },
    ])).toEqual([
      { field: "orderNo", header: "订单号" },
      { field: "note", header: "供应商备注" },
    ]);
  });

  it("fills forwarding customs fields while preserving split address columns", () => {
    const result = normalizeLogisticsExportColumns("HONGYA_IBERIA_FORWARD", [
      { field: "custom:declaredNameEn", header: "海关报关品名1" },
      { field: "productNames", header: "中文品名1" },
      { field: "custom:declaredAmount", header: "申报金额" },
      { field: "custom:declaredCurrency", header: "海关申报币种" },
      { field: "recipientRegion", header: "收件人省份" },
      { field: "recipientCity", header: "收件人城市" },
      { field: "recipientAddress", header: "收件人地址" },
      { field: "recipientPostalCode", header: "收件人邮编" },
    ]);

    expect(result).toEqual([
      { field: "constant:Phone", header: "海关报关品名1" },
      { field: "constant:手机", header: "中文品名1" },
      { field: "declarationAmount", header: "申报金额" },
      { field: "declarationCurrency", header: "海关申报币种" },
      { field: "recipientRegion", header: "收件人省份" },
      { field: "recipientCity", header: "收件人城市" },
      { field: "recipientAddress", header: "收件人地址" },
      { field: "recipientPostalCode", header: "收件人邮编" },
    ]);
  });

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

  it("marks review workbooks in the ASCII-safe filename without changing ordinary exports", () => {
    expect(logisticsExportFilename(iberiaCode, "2026-08-09")).toBe(
      "HONGYA_IBERIA_DROPSHIP-REVIEW-INCLUDES-ORIGINAL-ADDRESS-2026-08-09.xlsx",
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
