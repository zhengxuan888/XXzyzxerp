import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseLogisticsReturnWorkbook, trackingNumberProblem } from "@/lib/logistics-return-import";

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
});
