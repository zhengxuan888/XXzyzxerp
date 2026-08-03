import ExcelJS from "exceljs";

export const ORDER_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const ORDER_IMPORT_MAX_ROWS = 500;

export type OrderImportRow = {
  row: number;
  orderNo: string;
  shopId: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  country: string;
  city: string;
  postalCode: string;
  productCode: string;
  quantity: number;
  unitPriceCents: number;
  codAmountCents: number;
  currency: string;
  paymentMethod: string;
};

export type OrderImportProduct = {
  id: string;
  name: string;
};

export type CheckedOrderImportRow = OrderImportRow & {
  errors: string[];
  productId?: string;
  resolvedProductName?: string;
};

type ImportField = Exclude<keyof OrderImportRow, "row">;

const HEADER_ALIASES: Record<string, ImportField> = {
  orderno: "orderNo",
  订单号: "orderNo",
  shopid: "shopId",
  店铺id: "shopId",
  客户姓名: "customerName",
  customername: "customerName",
  姓名: "customerName",
  电话: "phone",
  phone: "phone",
  邮箱: "email",
  email: "email",
  地址: "address",
  收货地址: "address",
  国家: "country",
  country: "country",
  城市: "city",
  city: "city",
  邮编: "postalCode",
  postalcode: "postalCode",
  productcode: "productCode",
  商品编码: "productCode",
  sku: "productCode",
  数量: "quantity",
  quantity: "quantity",
  单价分: "unitPriceCents",
  unitpricecents: "unitPriceCents",
  cod金额分: "codAmountCents",
  codamountcents: "codAmountCents",
  币种: "currency",
  currency: "currency",
  付款方式: "paymentMethod",
  paymentmethod: "paymentMethod",
};

const REQUIRED_HEADERS: Array<{ field: ImportField; label: string }> = [
  { field: "shopId", label: "店铺 ID" },
  { field: "customerName", label: "客户姓名" },
  { field: "productCode", label: "商品编码" },
  { field: "quantity", label: "数量" },
  { field: "unitPriceCents", label: "单价分" },
];

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return cellText(value.result);
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("").trim();
  }
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  return String(value).trim();
}

function normalizeHeader(value: ExcelJS.CellValue) {
  return cellText(value).toLowerCase().replace(/\s/g, "");
}

export async function parseOrderImportWorkbook(input: Buffer | Uint8Array): Promise<OrderImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("工作簿没有工作表。");

  const columnMap = new Map<number, ImportField>();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const field = HEADER_ALIASES[normalizeHeader(cell.value)];
    if (field) columnMap.set(columnNumber, field);
  });
  if (columnMap.size === 0) throw new Error("首行未识别到订单模板字段。");

  const recognizedFields = new Set(columnMap.values());
  const missingHeaders = REQUIRED_HEADERS
    .filter(({ field }) => !recognizedFields.has(field))
    .map(({ label }) => label);
  if (missingHeaders.length > 0) {
    throw new Error(`模板缺少必填列：${missingHeaders.join("、")}。`);
  }

  const rows: OrderImportRow[] = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Partial<Record<ImportField, string>> = {};
    let hasContent = false;
    columnMap.forEach((field, columnNumber) => {
      const value = cellText(worksheetRow.getCell(columnNumber).value);
      raw[field] = value;
      if (value) hasContent = true;
    });
    if (!hasContent) return;

    rows.push({
      row: rowNumber,
      orderNo: raw.orderNo ?? "",
      shopId: raw.shopId ?? "",
      customerName: raw.customerName ?? "",
      phone: raw.phone ?? "",
      email: (raw.email ?? "").toLowerCase(),
      address: raw.address ?? "",
      country: (raw.country ?? "").toUpperCase(),
      city: raw.city ?? "",
      postalCode: raw.postalCode ?? "",
      productCode: raw.productCode ?? "",
      quantity: Number(raw.quantity),
      unitPriceCents: Number(raw.unitPriceCents),
      codAmountCents: Number(raw.codAmountCents || 0),
      currency: (raw.currency || "EUR").toUpperCase(),
      paymentMethod: raw.paymentMethod ?? "",
    });
  });
  return rows;
}

export function validateOrderImportRows(
  rows: OrderImportRow[],
  productsByCode: Map<string, OrderImportProduct>,
  existingOrderNos: Set<string> = new Set(),
): CheckedOrderImportRow[] {
  const orderNoCounts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.orderNo) orderNoCounts.set(row.orderNo, (orderNoCounts.get(row.orderNo) ?? 0) + 1);
  });

  return rows.map((row) => {
    const errors: string[] = [];
    const product = productsByCode.get(row.productCode.toLowerCase());
    if (!row.shopId) errors.push("店铺 ID 必填");
    if (!row.customerName) errors.push("客户姓名必填");
    if (!row.productCode || !product) errors.push("商品编码不存在或不属于当前业务板块");
    if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) errors.push("数量必须为正整数");
    if (!Number.isSafeInteger(row.unitPriceCents) || row.unitPriceCents < 0) errors.push("单价分必须为非负整数");
    if (!Number.isSafeInteger(row.codAmountCents) || row.codAmountCents < 0) errors.push("COD 金额分必须为非负整数");
    if (
      Number.isSafeInteger(row.quantity)
      && Number.isSafeInteger(row.unitPriceCents)
      && !Number.isSafeInteger(row.quantity * row.unitPriceCents)
    ) {
      errors.push("申报金额超过安全范围");
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("邮箱格式不正确");
    if (!/^[A-Z]{3}$/.test(row.currency)) errors.push("币种必须为 3 位字母代码");
    if (row.orderNo && (orderNoCounts.get(row.orderNo) ?? 0) > 1) errors.push("文件内订单号重复");
    if (row.orderNo && existingOrderNos.has(row.orderNo)) errors.push("订单号已存在");

    return {
      ...row,
      errors,
      productId: product?.id,
      resolvedProductName: product?.name,
    };
  });
}
