import { createHash } from "node:crypto";

import ExcelJS from "exceljs";

import {
  financeHeaderMatchesAlias,
  type FinanceStatementImportSheetRule,
  type FinanceStatementTemplateConfiguration,
} from "@/lib/finance/import-template";
import { FinanceMoneyValidationError, parseDecimalAmountToMinor } from "@/lib/finance/money";

const MAX_WORKBOOK_SHEETS = 20;
const MAX_TEMPLATE_ROWS = 5000;
const MAX_WORKSHEET_ROWS = 5001;
const MAX_WORKSHEET_COLUMNS = 200;
const SCIENTIFIC_NOTATION = /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i;

type PreviewStatus = "READY" | "WARNING" | "REJECTED";

export type FinanceStatementImportPreviewRow = {
  rowNumber: number;
  sourceRowHash: string;
  status: PreviewStatus;
  issueCodes: string[];
  message: string | null;
  sourceReference: string | null;
  trackingReference: string | null;
  description: string | null;
  currency: string;
  currencyScale: number;
  amountCents: bigint | null;
  sourceSnapshot: Record<string, string>;
};

export type FinanceStatementImportPreviewSheet = {
  sheetKey: string;
  sheetName: string;
  headerRowNumber: number;
  statementNo: string;
  statementType: FinanceStatementImportSheetRule["statementType"];
  currency: string;
  currencyScale: number;
  rows: FinanceStatementImportPreviewRow[];
  totalAmountCents: bigint;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
};

export type FinanceStatementWorkbookPreview = {
  sheets: FinanceStatementImportPreviewSheet[];
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
};

type CellValue = {
  text: string;
  formula: boolean;
  numeric: boolean;
};

type ColumnMap = {
  sourceReference: number;
  trackingReference: number | null;
  amount: number;
  description: number | null;
};

export class FinanceStatementWorkbookError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "FinanceStatementWorkbookError";
  }
}

function textFromValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const source = value as { richText?: Array<{ text?: unknown }>; text?: unknown; result?: unknown };
    if (Array.isArray(source.richText)) return source.richText.map((part) => String(part.text ?? "")).join("").trim();
    if (typeof source.text === "string") return source.text.trim();
    if (source.result !== undefined && source.result !== null) return String(source.result).trim();
  }
  return String(value).trim();
}

function readCell(cell: ExcelJS.Cell): CellValue {
  const raw = cell.value as unknown;
  const formula = Boolean(raw && typeof raw === "object" && "formula" in raw && typeof (raw as { formula?: unknown }).formula === "string");
  if (formula) return { text: "", formula: true, numeric: false };
  const rendered = typeof cell.text === "string" ? cell.text.trim() : "";
  return { text: rendered || textFromValue(raw), formula: false, numeric: typeof raw === "number" };
}

function normalizedText(value: string | null) {
  return value?.trim() || null;
}

function hasUnsafeReferenceNotation(value: string) {
  return SCIENTIFIC_NOTATION.test(value);
}

function fieldIssuePrefix(field: "sourceReference" | "trackingReference" | "description") {
  if (field === "sourceReference") return "SOURCE_REFERENCE";
  if (field === "trackingReference") return "TRACKING_REFERENCE";
  return "DESCRIPTION";
}

function fieldText(cell: CellValue, field: "sourceReference" | "trackingReference" | "description", max: number, issues: string[]) {
  const prefix = fieldIssuePrefix(field);
  if (cell.formula) {
    issues.push(`${prefix}_FORMULA_NOT_ALLOWED`);
    return null;
  }
  if ((field === "sourceReference" || field === "trackingReference") && cell.numeric) {
    // Identifier cells must remain text. Spreadsheet numeric cells can lose
    // leading zeros and silently round long values before our parser sees them.
    issues.push(`${prefix}_NUMERIC_NOT_ALLOWED`);
    return null;
  }
  const value = normalizedText(cell.text);
  if (!value) return null;
  if (value.length > max) {
    issues.push(`${prefix}_TOO_LONG`);
    return null;
  }
  if ((field === "sourceReference" || field === "trackingReference") && hasUnsafeReferenceNotation(value)) {
    issues.push(`${prefix}_SCIENTIFIC_NOTATION`);
    return null;
  }
  return value;
}

function exactColumn(headers: string[], aliases: string[]) {
  const matches = headers
    .map((header, index) => (financeHeaderMatchesAlias(header, aliases) ? index + 1 : null))
    .filter((index): index is number => index !== null);
  return matches;
}

function mapColumns(headers: string[], rule: FinanceStatementImportSheetRule): ColumnMap | null {
  const sourceReference = exactColumn(headers, rule.aliases.sourceReference);
  const amount = exactColumn(headers, rule.aliases.amount);
  if (!sourceReference.length || !amount.length) return null;
  const trackingReference = exactColumn(headers, rule.aliases.trackingReference);
  const description = exactColumn(headers, rule.aliases.description);
  if (sourceReference.length !== 1 || amount.length !== 1 || trackingReference.length > 1 || description.length > 1) {
    throw new FinanceStatementWorkbookError("HEADER_COLUMN_AMBIGUOUS", "模板别名匹配了多个表头列，请收窄模板配置。");
  }
  const used = [sourceReference[0], amount[0], trackingReference[0], description[0]].filter((value): value is number => value !== undefined && value !== null);
  if (new Set(used).size !== used.length) {
    throw new FinanceStatementWorkbookError("HEADER_MAPPING_COLLISION", "一个表头列不能同时映射到多个财务字段。");
  }
  return {
    sourceReference: sourceReference[0],
    trackingReference: trackingReference[0] ?? null,
    amount: amount[0],
    description: description[0] ?? null,
  };
}

function findHeader(sheet: ExcelJS.Worksheet, rule: FinanceStatementImportSheetRule) {
  const candidates: Array<{ rowNumber: number; columns: ColumnMap }> = [];
  const headerLimit = Math.min(sheet.rowCount, rule.headerScanRows);
  for (let rowNumber = 1; rowNumber <= headerLimit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const width = Math.max(row.cellCount, sheet.columnCount);
    const headers = Array.from({ length: width }, (_, index) => readCell(row.getCell(index + 1)).text);
    const columns = mapColumns(headers, rule);
    if (columns) candidates.push({ rowNumber, columns });
  }
  if (!candidates.length) {
    throw new FinanceStatementWorkbookError("REQUIRED_COLUMNS_MISSING", `未找到工作表 ${rule.key} 的必填表头。`);
  }
  if (candidates.length > 1) {
    throw new FinanceStatementWorkbookError("HEADER_ROW_AMBIGUOUS", `工作表 ${rule.key} 匹配到多个表头行。`);
  }
  return candidates[0];
}

function statementNo(prefix: string, rule: FinanceStatementImportSheetRule) {
  const value = `${prefix}${rule.statementNoSuffix}`.trim();
  if (!value || value.length > 100 || value.includes("\0")) {
    throw new FinanceStatementWorkbookError("INVALID_STATEMENT_NO", "结算单号前缀与模板后缀组合后不合法。");
  }
  return value;
}

function rowHash(input: Record<string, string | null>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function appendIssue(issues: string[], code: string) {
  if (!issues.includes(code)) issues.push(code);
}

function messageFor(issues: string[]) {
  const messages: Record<string, string> = {
    SOURCE_REFERENCE_REQUIRED: "缺少来源单号。",
    AMOUNT_REQUIRED: "缺少金额。",
    AMOUNT_INVALID: "金额格式或精度不正确。",
    AMOUNT_FORMULA_NOT_ALLOWED: "金额列不允许使用公式。",
    SOURCE_REFERENCE_FORMULA_NOT_ALLOWED: "来源单号列不允许使用公式。",
    TRACKING_REFERENCE_FORMULA_NOT_ALLOWED: "物流单号列不允许使用公式。",
    DESCRIPTION_FORMULA_NOT_ALLOWED: "说明列不允许使用公式。",
    SOURCE_REFERENCE_SCIENTIFIC_NOTATION: "来源单号为科学计数法，可能已经丢失精度。",
    TRACKING_REFERENCE_SCIENTIFIC_NOTATION: "物流单号为科学计数法，可能已经丢失精度。",
    SOURCE_REFERENCE_NUMERIC_NOT_ALLOWED: "来源单号必须以文本形式保存，避免前导零或长数字精度丢失。",
    TRACKING_REFERENCE_NUMERIC_NOT_ALLOWED: "物流单号必须以文本形式保存，避免前导零或长数字精度丢失。",
    SOURCE_REFERENCE_TOO_LONG: "来源单号过长。",
    TRACKING_REFERENCE_TOO_LONG: "物流单号过长。",
    DESCRIPTION_TOO_LONG: "说明过长。",
    DUPLICATE_SOURCE_ROW: "工作簿中存在完全重复的财务行。",
  };
  return issues.map((issue) => messages[issue] ?? issue).join(" ");
}

function parseRow(input: {
  row: ExcelJS.Row;
  rowNumber: number;
  rule: FinanceStatementImportSheetRule;
  columns: ColumnMap;
  sheetKey: string;
}): FinanceStatementImportPreviewRow | null {
  const sourceReferenceCell = readCell(input.row.getCell(input.columns.sourceReference));
  const trackingReferenceCell = input.columns.trackingReference ? readCell(input.row.getCell(input.columns.trackingReference)) : { text: "", formula: false, numeric: false };
  const amountCell = readCell(input.row.getCell(input.columns.amount));
  const descriptionCell = input.columns.description ? readCell(input.row.getCell(input.columns.description)) : { text: "", formula: false, numeric: false };
  const firstCell = readCell(input.row.getCell(1));
  // A formula is still a populated input. Treating it as an empty line would
  // silently skip a potentially material record instead of reporting the
  // formula policy violation to the reviewer.
  const candidates = [sourceReferenceCell, trackingReferenceCell, amountCell, descriptionCell];
  if (!candidates.some((value) => value.formula || value.text.trim())) return null;
  if (input.rule.skipIfFirstCellMatches.some((value) => financeHeaderMatchesAlias(firstCell.text, [value]))) return null;

  const issues: string[] = [];
  const sourceReference = fieldText(sourceReferenceCell, "sourceReference", 160, issues);
  const trackingReference = fieldText(trackingReferenceCell, "trackingReference", 160, issues);
  const description = fieldText(descriptionCell, "description", 1000, issues);
  if (!sourceReference) appendIssue(issues, "SOURCE_REFERENCE_REQUIRED");

  let amountCents: bigint | null = null;
  if (amountCell.formula) {
    appendIssue(issues, "AMOUNT_FORMULA_NOT_ALLOWED");
  } else if (!amountCell.text.trim()) {
    appendIssue(issues, "AMOUNT_REQUIRED");
  } else {
    try {
      amountCents = parseDecimalAmountToMinor(amountCell.text, input.rule.currencyScale, "金额");
    } catch (error) {
      if (error instanceof FinanceMoneyValidationError) appendIssue(issues, "AMOUNT_INVALID");
      else throw error;
    }
  }

  const snapshot = {
    sourceReference: sourceReferenceCell.text,
    trackingReference: trackingReferenceCell.text,
    amount: amountCell.text,
    description: descriptionCell.text,
  };
  return {
    rowNumber: input.rowNumber,
    sourceRowHash: rowHash({ sheetKey: input.sheetKey, rowNumber: String(input.rowNumber), ...snapshot }),
    status: issues.length ? "REJECTED" : "READY",
    issueCodes: issues,
    message: issues.length ? messageFor(issues) : null,
    sourceReference,
    trackingReference,
    description,
    currency: input.rule.currency,
    currencyScale: input.rule.currencyScale,
    amountCents,
    sourceSnapshot: snapshot,
  };
}

function rejectDuplicateRows(rows: FinanceStatementImportPreviewRow[]) {
  const groups = new Map<string, FinanceStatementImportPreviewRow[]>();
  for (const row of rows) {
    if (row.status !== "READY" || !row.amountCents) continue;
    const key = JSON.stringify({
      sourceReference: row.sourceReference,
      trackingReference: row.trackingReference,
      amountCents: row.amountCents.toString(),
      description: row.description,
    });
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const duplicates of groups.values()) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      row.status = "REJECTED";
      appendIssue(row.issueCodes, "DUPLICATE_SOURCE_ROW");
      row.message = messageFor(row.issueCodes);
    }
  }
}

function summarizeSheet(sheet: Omit<FinanceStatementImportPreviewSheet, "totalAmountCents" | "totalRows" | "readyRows" | "warningRows" | "rejectedRows">): FinanceStatementImportPreviewSheet {
  const readyRows = sheet.rows.filter((row) => row.status === "READY");
  const warnings = sheet.rows.filter((row) => row.status === "WARNING");
  const rejected = sheet.rows.filter((row) => row.status === "REJECTED");
  return {
    ...sheet,
    totalAmountCents: readyRows.reduce((total, row) => total + (row.amountCents ?? BigInt(0)), BigInt(0)),
    totalRows: sheet.rows.length,
    readyRows: readyRows.length,
    warningRows: warnings.length,
    rejectedRows: rejected.length,
  };
}

/**
 * Parses only explicitly configured XLSX sheets. It never executes workbook
 * formulas, never guesses a vendor schema and never associates a line with an
 * Order or Shipment; that association is a later, separately authorized
 * reconciliation step.
 */
export async function previewFinanceStatementWorkbook(
  bytes: Uint8Array,
  configuration: FinanceStatementTemplateConfiguration,
  statementNoPrefix: string,
): Promise<FinanceStatementWorkbookPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (!workbook.worksheets.length) throw new FinanceStatementWorkbookError("WORKBOOK_HAS_NO_SHEET");
  if (workbook.worksheets.length > MAX_WORKBOOK_SHEETS) throw new FinanceStatementWorkbookError("WORKBOOK_SHEET_LIMIT_EXCEEDED");

  const selected = new Set<string>();
  const sheets: FinanceStatementImportPreviewSheet[] = [];
  for (const rule of configuration.sheets) {
    const matches = workbook.worksheets.filter((sheet) => financeHeaderMatchesAlias(sheet.name, rule.sheetAliases));
    if (!matches.length) throw new FinanceStatementWorkbookError("TEMPLATE_SHEET_NOT_FOUND", `未找到模板配置的工作表：${rule.key}。`);
    if (matches.length > 1) throw new FinanceStatementWorkbookError("TEMPLATE_SHEET_AMBIGUOUS", `模板工作表别名匹配到多个表：${rule.key}。`);
    const sheet = matches[0];
    if (selected.has(sheet.name)) throw new FinanceStatementWorkbookError("TEMPLATE_SHEET_REUSED", "一个工作表不能被多个模板规则重复使用。");
    selected.add(sheet.name);
    if (sheet.rowCount > MAX_WORKSHEET_ROWS || sheet.columnCount > MAX_WORKSHEET_COLUMNS) {
      throw new FinanceStatementWorkbookError("WORKBOOK_DIMENSION_LIMIT_EXCEEDED");
    }
    const header = findHeader(sheet, rule);
    const rows: FinanceStatementImportPreviewRow[] = [];
    const startRow = header.rowNumber + rule.dataStartOffset;
    for (let rowNumber = startRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const parsed = parseRow({ row: sheet.getRow(rowNumber), rowNumber, rule, columns: header.columns, sheetKey: rule.key });
      if (parsed) rows.push(parsed);
    }
    rejectDuplicateRows(rows);
    sheets.push(summarizeSheet({
      sheetKey: rule.key,
      sheetName: sheet.name,
      headerRowNumber: header.rowNumber,
      statementNo: statementNo(statementNoPrefix, rule),
      statementType: rule.statementType,
      currency: rule.currency,
      currencyScale: rule.currencyScale,
      rows,
    }));
  }

  const totalRows = sheets.reduce((total, sheet) => total + sheet.totalRows, 0);
  if (!totalRows) throw new FinanceStatementWorkbookError("WORKBOOK_HAS_NO_IMPORT_ROWS", "工作簿没有可预检的账单行。");
  if (totalRows > MAX_TEMPLATE_ROWS) throw new FinanceStatementWorkbookError("TOO_MANY_ROWS", "一次账单预检最多 5000 行。");
  return {
    sheets,
    totalRows,
    readyRows: sheets.reduce((total, sheet) => total + sheet.readyRows, 0),
    warningRows: sheets.reduce((total, sheet) => total + sheet.warningRows, 0),
    rejectedRows: sheets.reduce((total, sheet) => total + sheet.rejectedRows, 0),
  };
}
