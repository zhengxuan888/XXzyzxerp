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

export type LogisticsExportField = (typeof LOGISTICS_EXPORT_FIELDS)[number];

export type LogisticsTemplateColumn = {
  field: LogisticsExportField;
  header: string;
};

export type LogisticsProviderTemplateConfiguration = {
  sheetName: string;
  columns: LogisticsTemplateColumn[];
};

const fieldSet = new Set<string>(LOGISTICS_EXPORT_FIELDS);

export function parseLogisticsTemplateConfiguration(value: unknown): LogisticsProviderTemplateConfiguration {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawColumns = Array.isArray(input.columns) ? input.columns : [];
  const columns = rawColumns.flatMap((column) => {
    if (!column || typeof column !== "object") return [];
    const row = column as Record<string, unknown>;
    const field = typeof row.field === "string" ? row.field.trim() : "";
    const header = typeof row.header === "string" ? row.header.trim().slice(0, 100) : "";
    if (!fieldSet.has(field) || !header) return [];
    return [{ field: field as LogisticsExportField, header }];
  });
  if (!columns.length) throw new Error("LOGISTICS_TEMPLATE_COLUMNS_REQUIRED");
  return {
    sheetName: typeof input.sheetName === "string" && input.sheetName.trim()
      ? input.sheetName.trim().slice(0, 31)
      : "出库订单",
    columns,
  };
}

export function parseColumnLines(raw: string): LogisticsTemplateColumn[] {
  return raw.split(/\r?\n/).flatMap((line) => {
    const [fieldRaw, ...headerParts] = line.split("=");
    const field = fieldRaw?.trim() ?? "";
    const header = headerParts.join("=").trim();
    if (!fieldSet.has(field) || !header) return [];
    return [{ field: field as LogisticsExportField, header }];
  });
}
