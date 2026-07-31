import ExcelJS from "exceljs";

export const PRODUCT_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 1000;
export const PRODUCT_IMPORT_HEADER_SCAN_ROWS = 24;

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

export type ProductImportAction = "CREATE_PRODUCT" | "CREATE_SKU" | "SKIP" | "REJECT";

export type CheckedProductImportRow = ProductImportRow & {
  errors: string[];
  action: ProductImportAction;
};

export type ProductImportCandidate = {
  sheetName: string;
  headerRow: number;
  matchedFields: ProductImportField[];
  score: number;
};

export type ProductImportDetection = {
  selected: ProductImportCandidate;
  candidates: ProductImportCandidate[];
  requiresSelection: boolean;
};

export type ProductImportAnalysis = {
  rows: ProductImportRow[];
  detection: ProductImportDetection;
};

export type ProductImportSelection = {
  sheetName?: string;
  headerRow?: number;
};

export type ExistingCatalogProduct = {
  id: string;
  code: string;
  name: string;
  skus: Array<{ code: string }>;
};

export type ProductImportSummary = {
  total: number;
  productsToCreate: number;
  skusToCreate: number;
  skip: number;
  reject: number;
};

export type ProductImportField = Exclude<keyof ProductImportRow, "row">;

const HEADER_ALIASES: Record<string, ProductImportField> = {
  productcode: "productCode",
  productid: "productCode",
  productno: "productCode",
  itemcode: "productCode",
  itemno: "productCode",
  goodsno: "productCode",
  materialcode: "productCode",
  商品编码: "productCode",
  产品编码: "productCode",
  商品编号: "productCode",
  产品编号: "productCode",
  货号: "productCode",
  商品货号: "productCode",
  productname: "productName",
  itemname: "productName",
  goodsname: "productName",
  name: "productName",
  商品名称: "productName",
  产品名称: "productName",
  品名: "productName",
  商品名: "productName",
  category: "category",
  分类: "category",
  类目: "category",
  商品分类: "category",
  unit: "unit",
  单位: "unit",
  description: "description",
  描述: "description",
  商品描述: "description",
  产品描述: "description",
  skucode: "skuCode",
  sku: "skuCode",
  skuno: "skuCode",
  skuid: "skuCode",
  sku编码: "skuCode",
  sku编号: "skuCode",
  barcode: "barcode",
  条形码: "barcode",
  条码: "barcode",
};

const REQUIRED_FIELDS: ProductImportField[] = ["productCode", "productName"];

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

function normalizedValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function mapHeaders(headers: string[]) {
  const map = new Map<number, ProductImportField>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && ![...map.values()].includes(field)) map.set(index + 1, field);
  });
  return map;
}

function candidateForHeaders(sheetName: string, headerRow: number, headers: string[]): ProductImportCandidate | null {
  const map = mapHeaders(headers);
  const fields = [...new Set(map.values())];
  if (!REQUIRED_FIELDS.every((field) => fields.includes(field))) return null;
  // Required business identity columns count more heavily than optional metadata.
  const score = fields.length + REQUIRED_FIELDS.filter((field) => fields.includes(field)).length * 4;
  return { sheetName, headerRow, matchedFields: fields, score };
}

function workbookRowValues(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  const count = Math.max(row.cellCount, sheet.columnCount);
  const values: string[] = [];
  for (let column = 1; column <= count; column += 1) values.push(text(row.getCell(column).value));
  return values;
}

function buildRows(sheet: ExcelJS.Worksheet, headerRow: number, headerMap: Map<number, ProductImportField>): ProductImportRow[] {
  const rows: ProductImportRow[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const raw: Partial<Record<ProductImportField, string>> = {};
    let hasContent = false;
    headerMap.forEach((field, column) => {
      const value = text(row.getCell(column).value);
      raw[field] = value;
      if (value) hasContent = true;
    });
    if (!hasContent) continue;
    rows.push({
      row: rowNumber,
      productCode: raw.productCode ?? "",
      productName: raw.productName ?? "",
      category: raw.category ?? "",
      unit: raw.unit ?? "",
      description: raw.description ?? "",
      skuCode: raw.skuCode ?? "",
      barcode: raw.barcode ?? "",
    });
  }
  return rows;
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

function selectedCandidate(candidates: ProductImportCandidate[], selection?: ProductImportSelection) {
  if (selection?.sheetName || selection?.headerRow) {
    const candidate = candidates.find((item) => item.sheetName === selection.sheetName && item.headerRow === selection.headerRow);
    if (!candidate) throw new Error("所选工作表或表头行未识别到商品模板字段，请重新预览。");
    return candidate;
  }
  const candidate = candidates[0];
  if (!candidate) throw new Error("未识别到同时包含“商品编码”和“商品名称”的表头。请调整表头或选择正确的工作表。");
  return candidate;
}

export function isProductImportWorkbook(input: Buffer) {
  // XLSX is a ZIP container. The extension is never treated as sufficient proof.
  return input.length >= 4 && input[0] === 0x50 && input[1] === 0x4b && [0x03, 0x05, 0x07].includes(input[2]);
}

export async function analyzeProductImportFile(
  input: Buffer,
  extension: "xlsx" | "csv",
  selection?: ProductImportSelection,
): Promise<ProductImportAnalysis> {
  if (extension === "csv") {
    const rawRows = input.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
    const candidate = candidateForHeaders("CSV", 1, rawRows[0] ?? []);
    if (!candidate) throw new Error("模板至少需要“商品编码”和“商品名称”两列。");
    if (selection?.sheetName && selection.sheetName !== "CSV") throw new Error("CSV 文件不包含所选工作表。");
    if (selection?.headerRow && selection.headerRow !== 1) throw new Error("CSV 文件的表头必须位于第 1 行。");
    return {
      rows: buildRowsFromRawRows(rawRows, candidate),
      detection: { selected: candidate, candidates: [candidate], requiresSelection: false },
    };
  }

  if (!isProductImportWorkbook(input)) throw new Error("文件扩展名为 XLSX，但文件内容不是有效的 Excel 工作簿。");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const candidates = workbook.worksheets.flatMap((sheet) => {
    const maxRow = Math.min(sheet.rowCount, PRODUCT_IMPORT_HEADER_SCAN_ROWS);
    const found: ProductImportCandidate[] = [];
    for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
      const candidate = candidateForHeaders(sheet.name, rowNumber, workbookRowValues(sheet, rowNumber));
      if (candidate) found.push(candidate);
    }
    return found;
  }).sort((left, right) => right.score - left.score || left.sheetName.localeCompare(right.sheetName) || left.headerRow - right.headerRow);
  const selected = selectedCandidate(candidates, selection);
  const sheet = workbook.getWorksheet(selected.sheetName);
  if (!sheet) throw new Error("所选工作表不存在，请重新预览。");
  const headerMap = mapHeaders(workbookRowValues(sheet, selected.headerRow));
  const requiresSelection = !selection && candidates.length > 1 && candidates[0].score === candidates[1].score;
  return {
    rows: buildRows(sheet, selected.headerRow, headerMap),
    detection: { selected, candidates, requiresSelection },
  };
}

function buildRowsFromRawRows(rawRows: string[][], candidate: ProductImportCandidate) {
  const headerMap = mapHeaders(rawRows[candidate.headerRow - 1] ?? []);
  return rawRows.slice(candidate.headerRow).flatMap((values, index) => {
    const raw: Partial<Record<ProductImportField, string>> = {};
    let hasContent = false;
    headerMap.forEach((field, column) => {
      const value = String(values[column - 1] ?? "").trim();
      raw[field] = value;
      if (value) hasContent = true;
    });
    if (!hasContent) return [];
    return [{
      row: candidate.headerRow + index + 1,
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

/**
 * Compatibility helper for callers that only need parsed rows. New import
 * flows should use analyzeProductImportFile so a human can resolve an
 * ambiguous workbook before any write occurs.
 */
export async function parseProductImportFile(input: Buffer, extension: "xlsx" | "csv") {
  return (await analyzeProductImportFile(input, extension)).rows;
}

function rowsByProduct(rows: ProductImportRow[]) {
  const groups = new Map<string, ProductImportRow[]>();
  rows.forEach((row) => {
    const key = normalizedValue(row.productCode);
    if (!key) return;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return groups;
}

function conflictingValue(rows: ProductImportRow[], field: "productName" | "category" | "unit" | "description") {
  const values = new Set(rows.map((row) => normalizedValue(row[field])).filter(Boolean));
  return values.size > 1;
}

export function validateProductImportRows(
  rows: ProductImportRow[],
  existingProducts: Map<string, ExistingCatalogProduct>,
): CheckedProductImportRow[] {
  const grouped = rowsByProduct(rows);
  const skuCounts = new Map<string, number>();
  rows.forEach((row) => {
    const product = normalizedValue(row.productCode);
    const sku = normalizedValue(row.skuCode);
    if (product && sku) {
      const key = `${product}::${sku}`;
      skuCounts.set(key, (skuCounts.get(key) ?? 0) + 1);
    }
  });

  const groupFirstRows = new Map<string, number>();
  grouped.forEach((group, productCode) => groupFirstRows.set(productCode, group[0].row));

  return rows.map((row) => {
    const errors: string[] = [];
    const productCode = normalizedValue(row.productCode);
    const skuCode = normalizedValue(row.skuCode);
    const group = grouped.get(productCode) ?? [];
    const existing = existingProducts.get(productCode);
    if (!row.productCode) errors.push("商品编码必填");
    if (!row.productName) errors.push("商品名称必填");
    if (productCode && group.length > 1) {
      const conflict = (["productName", "category", "unit", "description"] as const).find((field) => conflictingValue(group, field));
      if (conflict) errors.push("同一商品编码的名称或基础资料不一致，系统不会猜测覆盖哪一条");
    }
    if (skuCode && (skuCounts.get(`${productCode}::${skuCode}`) ?? 0) > 1) {
      errors.push("同一商品内的 SKU 编码重复");
    }
    if (existing && normalizedValue(existing.name) !== normalizedValue(row.productName)) {
      errors.push("商品编码已存在但商品名称不一致；为保护主数据，系统不会自动覆盖");
    }

    let action: ProductImportAction = "REJECT";
    if (errors.length === 0) {
      const skuAlreadyExists = Boolean(skuCode && existing?.skus.some((sku) => normalizedValue(sku.code) === skuCode));
      if (existing) {
        action = skuCode && !skuAlreadyExists ? "CREATE_SKU" : "SKIP";
      } else if (groupFirstRows.get(productCode) === row.row) {
        action = "CREATE_PRODUCT";
      } else {
        action = skuCode ? "CREATE_SKU" : "SKIP";
      }
    }
    return { ...row, errors, action };
  });
}

export function summarizeProductImportRows(rows: CheckedProductImportRow[]): ProductImportSummary {
  const productCodes = new Set(rows.filter((row) => row.action === "CREATE_PRODUCT").map((row) => normalizedValue(row.productCode)));
  const skusToCreate = rows.filter((row) => row.skuCode && (row.action === "CREATE_PRODUCT" || row.action === "CREATE_SKU")).length;
  return {
    total: rows.length,
    productsToCreate: productCodes.size,
    skusToCreate,
    skip: rows.filter((row) => row.action === "SKIP").length,
    reject: rows.filter((row) => row.action === "REJECT").length,
  };
}
