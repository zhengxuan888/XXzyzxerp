import ExcelJS from "exceljs";

export const PRODUCT_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 1000;

export type ProductImportRow = {
  row: number;
  productCode: string;
  productName: string;
  category: string;
  unit: string;
  description: string;
  skuCode: string;
  barcode: string;
};

export type CheckedProductImportRow = ProductImportRow & {
  errors: string[];
  action: "CREATE" | "SKIP" | "REJECT";
};

type ImportField = Exclude<keyof ProductImportRow, "row">;

const HEADER_ALIASES: Record<string, ImportField> = {
  productcode: "productCode",
  商品编码: "productCode",
  产品编码: "productCode",
  货号: "productCode",
  productname: "productName",
  商品名称: "productName",
  产品名称: "productName",
  品名: "productName",
  category: "category",
  分类: "category",
  类目: "category",
  unit: "unit",
  单位: "unit",
  description: "description",
  描述: "description",
  商品描述: "description",
  skucode: "skuCode",
  sku: "skuCode",
  sku编码: "skuCode",
  barcode: "barcode",
  条形码: "barcode",
  条码: "barcode",
};

function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return text(value.result);
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("").trim();
  }
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  return "";
}

function normalizeHeader(value: ExcelJS.CellValue | string) {
  return (typeof value === "string" ? value : text(value)).toLowerCase().replace(/[\s_\-（）()]/g, "");
}

function mapHeaders(headers: string[]) {
  const map = new Map<number, ImportField>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) map.set(index, field);
  });
  if (!map.size) throw new Error("未识别到商品字段，请检查首行列名。");
  const fields = new Set(map.values());
  if (!fields.has("productCode") || !fields.has("productName")) {
    throw new Error("模板至少需要“商品编码”和“商品名称”两列。");
  }
  return map;
}

function buildRows(rawRows: string[][]): ProductImportRow[] {
  const headerMap = mapHeaders(rawRows[0] ?? []);
  return rawRows.slice(1).flatMap((values, index) => {
    const raw: Partial<Record<ImportField, string>> = {};
    let hasContent = false;
    headerMap.forEach((field, column) => {
      const value = String(values[column] ?? "").trim();
      raw[field] = value;
      if (value) hasContent = true;
    });
    if (!hasContent) return [];
    return [{
      row: index + 2,
      productCode: raw.productCode ?? "",
      productName: raw.productName ?? "",
      category: raw.category ?? "",
      unit: raw.unit ?? "",
      description: raw.description ?? "",
      skuCode: raw.skuCode ?? "",
      barcode: raw.barcode ?? "",
    }];
  });
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

export async function parseProductImportFile(input: Buffer, extension: "xlsx" | "csv") {
  if (extension === "csv") {
    const content = input.toString("utf8").replace(/^\uFEFF/, "");
    return buildRows(content.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("工作簿中没有工作表。");
  const rawRows: string[][] = [];
  sheet.eachRow((row) => {
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) values.push(text(row.getCell(column).value));
    rawRows.push(values);
  });
  return buildRows(rawRows);
}

export function validateProductImportRows(
  rows: ProductImportRow[],
  existingProductCodes: Set<string>,
  existingSkuCodes: Set<string>,
): CheckedProductImportRow[] {
  const productCounts = new Map<string, number>();
  const skuCounts = new Map<string, number>();
  rows.forEach((row) => {
    const product = row.productCode.toLowerCase();
    const sku = row.skuCode.toLowerCase();
    if (product) productCounts.set(product, (productCounts.get(product) ?? 0) + 1);
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  });

  return rows.map((row) => {
    const errors: string[] = [];
    const product = row.productCode.toLowerCase();
    const sku = row.skuCode.toLowerCase();
    if (!row.productCode) errors.push("商品编码必填");
    if (!row.productName) errors.push("商品名称必填");
    if (product && (productCounts.get(product) ?? 0) > 1) errors.push("文件内商品编码重复");
    if (sku && (skuCounts.get(sku) ?? 0) > 1) errors.push("文件内 SKU 编码重复");
    if (sku && existingSkuCodes.has(sku)) errors.push("SKU 编码已存在");
    const exists = existingProductCodes.has(product);
    return {
      ...row,
      errors,
      action: errors.length ? "REJECT" : exists ? "SKIP" : "CREATE",
    };
  });
}
