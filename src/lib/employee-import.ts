import ExcelJS from "exceljs";

export const EMPLOYEE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const EMPLOYEE_IMPORT_MAX_ROWS = 500;
export type EmployeeImportRow = {
  row: number; username: string; fullName: string; email: string;
  departmentCode: string; roleCode: string; siteCode: string; managerUsername: string;
};
export type EmployeeReference = { id: string; code: string };
export type CheckedEmployeeImportRow = EmployeeImportRow & {
  errors: string[]; action: "CREATE" | "REJECT";
  departmentId?: string; roleId?: string; siteId?: string; managerMembershipId?: string;
};
type Field = Exclude<keyof EmployeeImportRow, "row">;
const ALIASES: Record<string, Field> = {
  username: "username", 账户名: "username", 用户名: "username", 员工账号: "username",
  fullname: "fullName", 姓名: "fullName", 员工姓名: "fullName",
  email: "email", 邮箱: "email",
  departmentcode: "departmentCode", 部门编码: "departmentCode", 部门: "departmentCode",
  rolecode: "roleCode", 角色编码: "roleCode", 角色: "roleCode",
  sitecode: "siteCode", 站点编码: "siteCode", 站点: "siteCode",
  managerusername: "managerUsername", 上级账号: "managerUsername", 直属上级: "managerUsername",
};
function text(value: ExcelJS.CellValue) {
  if (value == null) return ""; if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return text(value.result);
  if ("text" in value && typeof value.text === "string") return value.text.trim(); return "";
}
function normalize(value: string) { return value.toLowerCase().replace(/[\s_\-（）()]/g, ""); }
function csv(line: string) {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { out.push(value); value = ""; } else value += char;
  } out.push(value); return out;
}
function build(rawRows: string[][]) {
  const columns = new Map<number, Field>();
  (rawRows[0] ?? []).forEach((header, index) => { const field = ALIASES[normalize(header)]; if (field) columns.set(index, field); });
  const fields = new Set(columns.values());
  if (!fields.has("username") || !fields.has("fullName") || !fields.has("email") || !fields.has("departmentCode") || !fields.has("roleCode")) {
    throw new Error("模板必须包含账户名、姓名、邮箱、部门编码和角色编码。");
  }
  return rawRows.slice(1).flatMap((values, index) => {
    const raw: Partial<Record<Field, string>> = {}; let has = false;
    columns.forEach((field, column) => { raw[field] = String(values[column] ?? "").trim(); if (raw[field]) has = true; });
    if (!has) return [];
    return [{ row: index + 2, username: raw.username || "", fullName: raw.fullName || "",
      email: (raw.email || "").toLowerCase(), departmentCode: raw.departmentCode || "",
      roleCode: raw.roleCode || "", siteCode: raw.siteCode || "", managerUsername: raw.managerUsername || "" }];
  });
}
export async function parseEmployeeImportFile(input: Buffer, extension: "xlsx" | "csv") {
  if (extension === "csv") return build(input.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(csv));
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0]; if (!sheet) throw new Error("工作簿中没有工作表。");
  const rows: string[][] = []; sheet.eachRow((row) => { const values: string[] = []; for (let i = 1; i <= row.cellCount; i += 1) values.push(text(row.getCell(i).value)); rows.push(values); });
  return build(rows);
}
export function validateEmployeeImportRows(
  rows: EmployeeImportRow[],
  existingUsernames: Set<string>,
  existingEmails: Set<string>,
  departments: Map<string, EmployeeReference>,
  roles: Map<string, EmployeeReference>,
  sites: Map<string, EmployeeReference>,
  managers: Map<string, string>,
): CheckedEmployeeImportRow[] {
  const fileUsers = new Set<string>(); const fileEmails = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = []; const username = row.username.toLowerCase(); const email = row.email.toLowerCase();
    const department = departments.get(row.departmentCode.toLowerCase()); const role = roles.get(row.roleCode.toLowerCase());
    const site = row.siteCode ? sites.get(row.siteCode.toLowerCase()) : undefined;
    const managerMembershipId = row.managerUsername ? managers.get(row.managerUsername.toLowerCase()) : undefined;
    if (!username || !row.fullName || !email) errors.push("账户名、姓名和邮箱必填");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("邮箱格式不正确");
    if (existingUsernames.has(username) || existingEmails.has(email) || fileUsers.has(username) || fileEmails.has(email)) errors.push("账户名或邮箱重复");
    if (!department) errors.push("部门不存在或不在授权范围");
    if (!role) errors.push("角色不存在");
    if (row.siteCode && !site) errors.push("站点不存在或不在授权范围");
    if (row.managerUsername && !managerMembershipId) errors.push("直属上级不存在或不在当前业务板块");
    fileUsers.add(username); fileEmails.add(email);
    return { ...row, departmentId: department?.id, roleId: role?.id, siteId: site?.id, managerMembershipId,
      errors, action: errors.length ? "REJECT" : "CREATE" };
  });
}
