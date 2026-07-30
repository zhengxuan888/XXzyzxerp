import ExcelJS from "exceljs";

import {
  DEFAULT_RETURN_WORKBOOK_MAPPING,
  headerMatchesAlias,
  type ReturnWorkbookMapping,
} from "@/lib/logistics-provider-template";

export type { ReturnWorkbookAliases } from "@/lib/logistics-provider-template";

export type LogisticsReturnRow = {
  rowNumber: number;
  orderNo: string;
  trackingNo: string;
  carrier: string;
  providerStatus: string;
};

export type LogisticsReturnWorkbookParseResult = {
  worksheetName: string;
  headerRowNumber: number;
  rows: LogisticsReturnRow[];
};

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) return String(value.result).trim();
  }
  return String(value).trim();
}

function findColumn(headers: string[], aliases: string[]) {
  const index = headers.findIndex((header) => headerMatchesAlias(header, aliases));
  return index === -1 ? null : index + 1;
}

function columnsForHeader(headers: string[], mapping: ReturnWorkbookMapping) {
  return {
    orderNo: findColumn(headers, mapping.aliases.orderNo),
    trackingNo: findColumn(headers, mapping.aliases.trackingNo),
    carrier: findColumn(headers, mapping.aliases.carrier),
    providerStatus: findColumn(headers, mapping.aliases.providerStatus),
  };
}

export async function parseLogisticsReturnWorkbookDetails(
  bytes: Buffer,
  mapping: ReturnWorkbookMapping = DEFAULT_RETURN_WORKBOOK_MAPPING,
): Promise<LogisticsReturnWorkbookParseResult> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS still publishes its own legacy Buffer declaration; the runtime
  // accepts the Node.js Buffer produced by the private upload route.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (!workbook.worksheets.length) throw new Error("WORKBOOK_HAS_NO_SHEET");
  if (workbook.worksheets.length > 20) throw new Error("WORKBOOK_SHEET_LIMIT_EXCEEDED");

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 5001 || sheet.columnCount > 200) throw new Error("WORKBOOK_DIMENSION_LIMIT_EXCEEDED");
    const headerLimit = Math.min(sheet.rowCount, mapping.headerScanRows);
    for (let headerRowNumber = 1; headerRowNumber <= headerLimit; headerRowNumber += 1) {
      const headerRow = sheet.getRow(headerRowNumber);
      const headers = Array.from({ length: headerRow.cellCount }, (_, index) => cellText(headerRow.getCell(index + 1)));
      const columns = columnsForHeader(headers, mapping);
      if (!columns.orderNo || !columns.trackingNo) continue;

      const rows: LogisticsReturnRow[] = [];
      for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const orderNo = cellText(row.getCell(columns.orderNo));
        const trackingNo = cellText(row.getCell(columns.trackingNo));
        if (!orderNo && !trackingNo) continue;
        rows.push({
          rowNumber,
          orderNo,
          trackingNo,
          carrier: columns.carrier ? cellText(row.getCell(columns.carrier)) : "",
          providerStatus: columns.providerStatus ? cellText(row.getCell(columns.providerStatus)) : "",
        });
      }
      return { worksheetName: sheet.name, headerRowNumber, rows };
    }
  }

  throw new Error("REQUIRED_COLUMNS_MISSING");
}

export async function parseLogisticsReturnWorkbook(
  bytes: Buffer,
  mapping: ReturnWorkbookMapping = DEFAULT_RETURN_WORKBOOK_MAPPING,
): Promise<LogisticsReturnRow[]> {
  return (await parseLogisticsReturnWorkbookDetails(bytes, mapping)).rows;
}

export function trackingNumberProblem(value: string) {
  if (!value) return "物流单号为空";
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)) return "物流单号是科学计数法，可能已经丢失精度";
  if (value.length > 100) return "物流单号过长";
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/.test(value)) return "物流单号包含非法字符";
  return null;
}
