import ExcelJS from "exceljs";

export const CUSTOMER_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_IMPORT_MAX_ROWS = 2000;

export type CustomerImportRow = {
  row: number;
  code: string;
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  taxId: string;
  address: string;
};

export type CheckedCustomerImportRow = CustomerImportRow & {
  action: "CREATE" | "SKIP" | "REJECT";
  errors: string[];
};

type Field = Exclude<keyof CustomerImportRow, "row">;
const ALIASES: Record<string, Field> = {
  customercode: "code", 客户编码: "code", 客户编号: "code", 编号: "code",
  customername: "name", 客户名称: "name", 收件人: "name", 姓名: "name",
  contactname: "contactName", 联系人: "contactName",
  contactphone: "contactPhone", 联系电话: "contactPhone", 电话: "contactPhone", 手机: "contactPhone", whatsapp: "contactPhone",
  contactemail: "contactEmail", 邮箱: "contactEmail", email: "contactEmail",
  taxid: "taxId", 税号: "taxId",
  address: "address", 地址: "address", 收货地址: "address",
};

function cellText(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return cellText(value.result);
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((item) => item.text).join("").trim();
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  return "";
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[\s_\-（）()]/g, "");
}

function csvLine(line: string) {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(value); value = ""; }
    else value += char;
  }
  result.push(value);
  return result;
}

function build(rawRows: string[][]) {
  const columns = new Map<number, Field>();
  (rawRows[0] ?? []).forEach((header, index) => {
    const field = ALIASES[normalized(header)];
    if (field) columns.set(index, field);
  });
  if (![...columns.values()].includes("name")) throw new Error("模板必须包含“客户名称/收件人/姓名”列。");
  return rawRows.slice(1).flatMap((values, index) => {
    const raw: Partial<Record<Field, string>> = {};
    let hasContent = false;
    columns.forEach((field, column) => {
      raw[field] = String(values[column] ?? "").trim();
      if (raw[field]) hasContent = true;
    });
    if (!hasContent) return [];
    return [{
      row: index + 2,
      code: raw.code ?? "",
      name: raw.name ?? "",
      contactName: raw.contactName ?? "",
      contactPhone: raw.contactPhone ?? "",
      contactEmail: (raw.contactEmail ?? "").toLowerCase(),
      taxId: raw.taxId ?? "",
      address: raw.address ?? "",
    }];
  });
}

export async function parseCustomerImportFile(input: Buffer, extension: "xlsx" | "csv") {
  if (extension === "csv") {
    return build(input.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(csvLine));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("工作簿中没有工作表。");
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) values.push(cellText(row.getCell(column).value));
    rows.push(values);
  });
  return build(rows);
}

export function validateCustomerImportRows(
  rows: CustomerImportRow[],
  existingCodes: Set<string>,
  existingEmails: Set<string>,
  existingPhones: Set<string>,
): CheckedCustomerImportRow[] {
  const fileCodes = new Set<string>();
  const fileEmails = new Set<string>();
  const filePhones = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const code = row.code.toLowerCase();
    const email = row.contactEmail.toLowerCase();
    const phone = row.contactPhone.replace(/\s/g, "");
    if (!row.name) errors.push("客户名称必填");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("邮箱格式不正确");
    if (!code && !email && !phone) errors.push("客户编码、邮箱或电话至少填写一项");
    if ((code && fileCodes.has(code)) || (email && fileEmails.has(email)) || (phone && filePhones.has(phone))) {
      errors.push("文件内客户重复");
    }
    if (code) fileCodes.add(code);
    if (email) fileEmails.add(email);
    if (phone) filePhones.add(phone);
    const exists = (code && existingCodes.has(code)) || (email && existingEmails.has(email)) || (phone && existingPhones.has(phone));
    return { ...row, errors, action: errors.length ? "REJECT" : exists ? "SKIP" : "CREATE" };
  });
}
