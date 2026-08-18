import ExcelJS from "exceljs";

import { exportFieldValue, type BatchExportOrder } from "@/lib/logistics-batch";
import { applyLogisticsExportPresentation } from "@/lib/logistics-export-review";
import type { LogisticsTemplateColumn } from "@/lib/logistics-provider-template";

type BuildLogisticsExportWorkbookInput = {
  templateCode: string;
  sheetName: string;
  columns: readonly LogisticsTemplateColumn[];
  countryRoutes: Readonly<Record<string, string>>;
  headerFill: string | null;
  headerFontColor: string | null;
  orders: readonly BatchExportOrder[];
};

export type LogisticsExportWorkbookResult = {
  output: Buffer;
  payloads: Array<Record<string, string | number>>;
};

export async function buildLogisticsExportWorkbook({
  templateCode,
  sheetName,
  columns,
  countryRoutes,
  headerFill,
  headerFontColor,
  orders,
}: BuildLogisticsExportWorkbookInput): Promise<LogisticsExportWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.field, width: 18 }));
  const payloads = orders.map((order) => {
    const values = columns.map((column) => column.field === "shippingRoute"
      ? countryRoutes[order.recipientCountryCode?.toUpperCase() ?? ""] ?? ""
      : exportFieldValue(order, column.field));
    const payload = Object.fromEntries(columns.map((column, index) => [`${index + 1}:${column.header}`, values[index]]));
    sheet.addRow(values);
    return payload;
  });
  sheet.getRow(1).font = { bold: true, color: headerFontColor ? { argb: `FF${headerFontColor}` } : undefined };
  if (headerFill) {
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
  }
  applyLogisticsExportPresentation(sheet, columns, templateCode);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: columns.length } };
  return {
    output: Buffer.from(await workbook.xlsx.writeBuffer()),
    payloads,
  };
}
