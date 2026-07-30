export const LOGISTICS_EXPORT_FIELDS = [
  "orderNo",
  "recipientName",
  "recipientPhone",
  "recipientEmail",
  "recipientCountryCode",
  "recipientPostalCode",
  "recipientRegion",
  "recipientCity",
  "recipientAddress",
  "productNames",
  "quantity",
  "codAmount",
  "currency",
  "customerWhatsapp",
  "note",
] as const;

export const LOGISTICS_RETURN_FIELDS = ["orderNo", "trackingNo", "carrier", "providerStatus"] as const;

export type LogisticsCoreExportField = (typeof LOGISTICS_EXPORT_FIELDS)[number];
export type LogisticsExportField = LogisticsCoreExportField | `custom:${string}`;
export type LogisticsReturnField = (typeof LOGISTICS_RETURN_FIELDS)[number];

export type LogisticsTemplateColumn = {
  field: LogisticsExportField;
  header: string;
};

export type ReturnWorkbookAliases = Record<LogisticsReturnField, string[]>;

export type ReturnWorkbookMapping = {
  headerScanRows: number;
  aliases: ReturnWorkbookAliases;
};

export type LogisticsProviderTemplateConfiguration = {
  sheetName: string;
  columns: LogisticsTemplateColumn[];
  returnWorkbook: ReturnWorkbookMapping;
};

const coreFieldSet = new Set<string>(LOGISTICS_EXPORT_FIELDS);
const customFieldPattern = /^custom:([a-zA-Z0-9_.-]{1,80})$/;

// This is only a backward-compatible starting profile for old template rows.
// Every newly created/edited template stores its own mapping in the database.
export const DEFAULT_RETURN_WORKBOOK_MAPPING: ReturnWorkbookMapping = {
  headerScanRows: 5,
  aliases: {
    orderNo: ["原单号", "订单号", "客户单号", "客户订单号"],
    trackingNo: ["转单号", "物流单号", "运单号", "追踪号"],
    carrier: ["运输方式", "承运商", "物流商", "物流渠道"],
    providerStatus: ["状态", "订单状态", "物流状态"],
  },
};

function normalizeHeader(value: string) {
  return value.replace(/[\s　]+/g, "").trim().toLocaleLowerCase("en-US");
}

function cleanAliases(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 100))
    .filter(Boolean))];
}

export function parseLogisticsExportField(value: unknown): LogisticsExportField | null {
  if (typeof value !== "string") return null;
  const field = value.trim();
  if (coreFieldSet.has(field)) return field as LogisticsCoreExportField;
  return customFieldPattern.test(field) ? field as LogisticsExportField : null;
}

export function parseReturnWorkbookMapping(value: unknown): ReturnWorkbookMapping {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const aliasesInput = input.aliases && typeof input.aliases === "object"
    ? input.aliases as Record<string, unknown>
    : {};
  const aliases = Object.fromEntries(LOGISTICS_RETURN_FIELDS.map((field) => {
    const configured = cleanAliases(aliasesInput[field]);
    return [field, configured.length ? configured : DEFAULT_RETURN_WORKBOOK_MAPPING.aliases[field]];
  })) as ReturnWorkbookAliases;
  const rawHeaderScanRows = typeof input.headerScanRows === "number" ? input.headerScanRows : Number(input.headerScanRows);
  const headerScanRows = Number.isInteger(rawHeaderScanRows)
    ? Math.min(20, Math.max(1, rawHeaderScanRows))
    : DEFAULT_RETURN_WORKBOOK_MAPPING.headerScanRows;
  return { headerScanRows, aliases };
}

export function parseReturnMappingLines(raw: string, headerScanRows?: unknown): ReturnWorkbookMapping {
  const aliases: Partial<ReturnWorkbookAliases> = {};
  for (const line of raw.split(/\r?\n/)) {
    const [fieldRaw, ...aliasParts] = line.split("=");
    const field = fieldRaw?.trim() as LogisticsReturnField | undefined;
    if (!field || !LOGISTICS_RETURN_FIELDS.includes(field)) continue;
    const configured = aliasParts.join("=").split(",").map((item) => item.trim()).filter(Boolean);
    if (configured.length) aliases[field] = configured;
  }
  return parseReturnWorkbookMapping({ headerScanRows, aliases });
}

export function returnMappingLines(mapping: ReturnWorkbookMapping) {
  return LOGISTICS_RETURN_FIELDS
    .map((field) => `${field}=${mapping.aliases[field].join(",")}`)
    .join("\n");
}

export function parseLogisticsTemplateConfiguration(value: unknown): LogisticsProviderTemplateConfiguration {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawColumns = Array.isArray(input.columns) ? input.columns : [];
  const columns = rawColumns.flatMap((column) => {
    if (!column || typeof column !== "object") return [];
    const row = column as Record<string, unknown>;
    const field = parseLogisticsExportField(row.field);
    const header = typeof row.header === "string" ? row.header.trim().slice(0, 100) : "";
    if (!field || !header) return [];
    return [{ field, header }];
  });
  if (!columns.length) throw new Error("LOGISTICS_TEMPLATE_COLUMNS_REQUIRED");
  return {
    sheetName: typeof input.sheetName === "string" && input.sheetName.trim()
      ? input.sheetName.trim().slice(0, 31)
      : "出库订单",
    columns,
    returnWorkbook: parseReturnWorkbookMapping(input.returnWorkbook),
  };
}

export function parseColumnLines(raw: string): LogisticsTemplateColumn[] {
  return raw.split(/\r?\n/).flatMap((line) => {
    const [fieldRaw, ...headerParts] = line.split("=");
    const field = parseLogisticsExportField(fieldRaw);
    const header = headerParts.join("=").trim();
    if (!field || !header) return [];
    return [{ field, header }];
  });
}

export function headerMatchesAlias(header: string, aliases: string[]) {
  const normalized = normalizeHeader(header);
  return aliases.some((alias) => normalizeHeader(alias) === normalized);
}
