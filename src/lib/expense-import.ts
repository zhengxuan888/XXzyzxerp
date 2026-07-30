import ExcelJS from "exceljs";

export const EXPENSE_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPENSE_IMPORT_MAX_ROWS = 2000;
export type ExpenseImportRow = { row: number; orderNo: string; category: string; amountCents: number; amountText: string; currency: string; paidAt: string; note: string };
export type CheckedExpenseImportRow = ExpenseImportRow & { action: "CREATE" | "SKIP" | "REJECT"; errors: string[]; orderId?: string };
type Field = "orderNo" | "category" | "amount" | "amountCents" | "currency" | "paidAt" | "note";
const ALIASES: Record<string, Field> = {
  orderno: "orderNo", 订单号: "orderNo", category: "category", 类别: "category", 费用类别: "category",
  amount: "amount", 金额: "amount", amountcents: "amountCents", 金额分: "amountCents",
  currency: "currency", 币种: "currency", paidat: "paidAt", 付款日期: "paidAt", 支付日期: "paidAt",
  note: "note", 备注: "note",
};
function text(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return text(value.result);
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  return "";
}
function normalize(value: string) { return value.toLowerCase().replace(/[\s_\-（）()]/g, ""); }
function cents(value: string, alreadyCents: boolean) {
  const cleaned = value.replace(/[,￥¥€$£\s]/g, "");
  if (!cleaned) return Number.NaN;
  if (alreadyCents) {
    const parsed = Number(cleaned);
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, decimal = ""] = cleaned.split(".");
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : Number.NaN;
}
function csv(line: string) {
  const result: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(value); value = ""; }
    else value += char;
  }
  result.push(value); return result;
}
function build(rawRows: string[][]) {
  const columns = new Map<number, Field>();
  (rawRows[0] ?? []).forEach((header, index) => { const field = ALIASES[normalize(header)]; if (field) columns.set(index, field); });
  if (![...columns.values()].includes("category") || ![...columns.values()].some((field) => field === "amount" || field === "amountCents")) {
    throw new Error("模板必须包含“费用类别”和“金额”列。");
  }
  return rawRows.slice(1).flatMap((values, index) => {
    const raw: Partial<Record<Field, string>> = {}; let has = false;
    columns.forEach((field, column) => { raw[field] = String(values[column] ?? "").trim(); if (raw[field]) has = true; });
    if (!has) return [];
    const amountText = raw.amountCents || raw.amount || "";
    return [{ row: index + 2, orderNo: raw.orderNo || "", category: raw.category || "", amountText,
      amountCents: cents(amountText, Boolean(raw.amountCents)), currency: (raw.currency || "CNY").toUpperCase(),
      paidAt: raw.paidAt || "", note: raw.note || "" }];
  });
}
export async function parseExpenseImportFile(input: Buffer, extension: "xlsx" | "csv") {
  if (extension === "csv") return build(input.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(csv));
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0]; if (!sheet) throw new Error("工作簿中没有工作表。");
  const rows: string[][] = []; sheet.eachRow((row) => { const values: string[] = []; for (let i = 1; i <= row.cellCount; i += 1) values.push(text(row.getCell(i).value)); rows.push(values); });
  return build(rows);
}
export function validateExpenseImportRows(rows: ExpenseImportRow[], orders: Map<string, string>, existingKeys = new Set<string>()) {
  const fileKeys = new Set<string>();
  return rows.map((row): CheckedExpenseImportRow => {
    const errors: string[] = []; const orderId = row.orderNo ? orders.get(row.orderNo) : undefined;
    if (!row.category) errors.push("费用类别必填");
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents < 0) errors.push("金额格式不正确");
    if (!/^[A-Z]{3}$/.test(row.currency)) errors.push("币种必须为 3 位字母代码");
    if (row.paidAt && Number.isNaN(Date.parse(row.paidAt))) errors.push("付款日期格式不正确");
    if (row.orderNo && !orderId) errors.push("订单号不存在或不属于当前业务板块");
    const key = `${row.orderNo}|${row.category.toLowerCase()}|${row.amountCents}|${row.paidAt}`;
    if (fileKeys.has(key)) errors.push("文件内费用重复"); fileKeys.add(key);
    return { ...row, orderId, errors, action: errors.length ? "REJECT" : existingKeys.has(key) ? "SKIP" : "CREATE" };
  });
}
