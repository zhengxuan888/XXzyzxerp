import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseLogisticsReturnWorkbook, parseLogisticsReturnWorkbookDetails, trackingNumberProblem } from "@/lib/logistics-return-import";

async function workbookBuffer(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("订单明细").addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("logistics return import", () => {
  it("maps provider return columns without depending on fixed positions", async () => {
    const bytes = await workbookBuffer([
      ["状态", "运输方式", "转单号", "原单号"],
      ["已出货", "鸿亚专线", "TRACK-001", "ERP-001"],
    ]);
    await expect(parseLogisticsReturnWorkbook(bytes)).resolves.toEqual([
      {
        rowNumber: 2,
        orderNo: "ERP-001",
        trackingNo: "TRACK-001",
        carrier: "鸿亚专线",
        providerStatus: "已出货",
      },
    ]);
  });

  it("rejects scientific notation and unsafe tracking numbers", () => {
    expect(trackingNumberProblem("8.828E+18")).toContain("科学计数法");
    expect(trackingNumberProblem("../TRACK")).toContain("非法字符");
    expect(trackingNumberProblem("0082800082909724860095")).toBeNull();
  });

  it("finds a configured header row on a later row and keeps the matching sheet", async () => {
    const bytes = await workbookBuffer([
      ["provider return report"],
      ["reference", "parcel number", "delivery state"],
      ["ERP-002", "TRACK-002", "created"],
    ]);
    const parsed = await parseLogisticsReturnWorkbookDetails(bytes, {
      headerScanRows: 3,
      aliases: {
        orderNo: ["reference"],
        trackingNo: ["parcel number"],
        carrier: ["carrier"],
        providerStatus: ["delivery state"],
      },
    });
    expect(parsed.headerRowNumber).toBe(2);
    expect(parsed.rows).toEqual([{ rowNumber: 3, orderNo: "ERP-002", trackingNo: "TRACK-002", carrier: "", providerStatus: "created" }]);
  });

  it("recognizes forwarding-provider tracking headers from an older template snapshot", async () => {
    const bytes = await workbookBuffer([
      ["客户订单号", "客户订单编号", "转寄单号"],
      ["OLD-TRACK-1", "ERP-003", "NEW-TRACK-3"],
    ]);
    const parsed = await parseLogisticsReturnWorkbookDetails(bytes, {
      headerScanRows: 5,
      aliases: {
        orderNo: ["客户订单编号"],
        trackingNo: ["转单号", "物流单号", "运单号"],
        carrier: ["运输渠道"],
        providerStatus: ["状态"],
      },
    });
    expect(parsed.rows[0]).toMatchObject({ orderNo: "ERP-003", trackingNo: "NEW-TRACK-3" });
  });
});
