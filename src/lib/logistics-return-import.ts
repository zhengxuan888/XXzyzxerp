import ExcelJS from "exceljs";

export type LogisticsReturnRow = {
  rowNumber: number;
  orderNo: string;
  trackingNo: string;
  carrier: string;
  providerStatus: string;
};

export type ReturnWorkbookAliases = Partial<typeof DEFAULT_HEADERS>;

const DEFAULT_HEADERS = {
  orderNo: ["原单号", "订单号", "客户单号"],
  trackingNo: ["转单号", "物流单号", "运单号", "追踪号"],
  carrier: ["运输方式", "承运商", "物流渠道"],
  providerStatus: ["状态", "订单状态"],
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
  const index = headers.findIndex((header) => aliases.includes(header.replace(/\s+/g, "")));
  return index === -1 ? null : index + 1;
}

export async function parseLogisticsReturnWorkbook(
  bytes: Buffer,
  aliases: ReturnWorkbookAliases = {},
): Promise<LogisticsReturnRow[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS still publishes its own legacy Buffer declaration; the runtime
  // accepts the Node.js Buffer produced by the upload route.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("WORKBOOK_HAS_NO_SHEET");

  const headerRow = sheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    cellText(headerRow.getCell(index + 1)).replace(/\s+/g, ""),
  );
  const merged = { ...DEFAULT_HEADERS, ...aliases };
  const columns = {
    orderNo: findColumn(headers, merged.orderNo),
    trackingNo: findColumn(headers, merged.trackingNo),
    carrier: findColumn(headers, merged.carrier),
    providerStatus: findColumn(headers, merged.providerStatus),
  };
  if (!columns.orderNo || !columns.trackingNo) throw new Error("REQUIRED_COLUMNS_MISSING");

  const rows: LogisticsReturnRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const orderNo = cellText(row.getCell(columns.orderNo));
    const trackingCell = row.getCell(columns.trackingNo);
    const trackingNo = cellText(trackingCell);
    if (!orderNo && !trackingNo) continue;
    rows.push({
      rowNumber,
      orderNo,
      trackingNo,
      carrier: columns.carrier ? cellText(row.getCell(columns.carrier)) : "",
      providerStatus: columns.providerStatus ? cellText(row.getCell(columns.providerStatus)) : "",
    });
  }
  return rows;
}

export function trackingNumberProblem(value: string) {
  if (!value) return "物流单号为空";
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)) return "物流单号是科学计数法，可能已经丢失精度";
  if (value.length > 100) return "物流单号过长";
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/.test(value)) return "物流单号包含非法字符";
  return null;
}
