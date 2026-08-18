import { createHash, randomUUID } from "node:crypto";

import type { LogisticsCoreExportField, LogisticsExportField } from "@/lib/logistics-provider-template";
import { parseSmartAddressText } from "@/lib/smart-address";

type BatchExportItem = {
  productName: string;
  quantity: number;
  unitPriceCents?: number;
  sku?: { code: string } | null;
};

export type BatchExportOrder = {
  orderNo: string;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientCountryCode: string | null;
  recipientPostalCode: string | null;
  recipientRegion: string | null;
  recipientCity: string | null;
  recipientDistrict?: string | null;
  recipientStreet?: string | null;
  recipientHouseNumber?: string | null;
  recipientAddress: string | null;
  recipientFullAddress?: string | null;
  codAmountCents: number;
  currency: string;
  productValueCents: number;
  declarationCurrency: string;
  customerWhatsapp: string | null;
  note: string | null;
  customFields: unknown;
  items: BatchExportItem[];
  creatorUser?: { username: string; fullName: string | null };
};

function scalarText(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function customFieldValue(input: unknown, key: string) {
  let value: unknown = input;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    value = (value as Record<string, unknown>)[segment];
  }
  return scalarText(value);
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = scalarText(value);
    if (normalized !== "") return normalized;
  }
  return "";
}

export type ResolvableStructuredAddressOrder = {
  recipientCountryCode?: string | null;
  recipientRegion?: string | null;
  recipientDistrict?: string | null;
  recipientStreet?: string | null;
  recipientHouseNumber?: string | null;
  recipientAddress?: string | null;
  recipientFullAddress?: string | null;
  customFields?: unknown;
};

export function resolveStructuredAddressForExport(order: ResolvableStructuredAddressOrder) {
  const parsed = parseSmartAddressText(
    order.recipientFullAddress || order.recipientAddress || "",
    order.recipientCountryCode || undefined,
  );
  return {
    region: String(firstNonEmpty(order.recipientRegion)),
    district: String(firstNonEmpty(
      order.recipientDistrict,
      customFieldValue(order.customFields, "recipientDistrict"),
      parsed.district,
    )),
    street: String(firstNonEmpty(
      order.recipientStreet,
      customFieldValue(order.customFields, "recipientStreet"),
      customFieldValue(order.customFields, "street"),
      parsed.street,
    )),
    houseNumber: String(firstNonEmpty(
      order.recipientHouseNumber,
      customFieldValue(order.customFields, "recipientHouseNumber"),
      customFieldValue(order.customFields, "houseNumber"),
      customFieldValue(order.customFields, "doorNumber"),
      parsed.houseNumber,
    )),
  };
}

function legacyStructuredAddressValue(order: BatchExportOrder, key: string) {
  switch (key) {
    case "recipientDistrict":
      return order.recipientDistrict ?? "";
    case "street":
    case "recipientStreet":
      return order.recipientStreet ?? "";
    case "doorNumber":
    case "houseNumber":
    case "recipientHouseNumber":
      return order.recipientHouseNumber ?? "";
    default:
      return "";
  }
}

export function exportFieldValue(order: BatchExportOrder, field: LogisticsExportField): string | number {
  if (field.startsWith("custom:")) {
    const key = field.slice("custom:".length);
    return firstNonEmpty(legacyStructuredAddressValue(order, key), customFieldValue(order.customFields, key));
  }
  if (field.startsWith("constant:")) return field.slice("constant:".length);
  const structuredAddress = resolveStructuredAddressForExport(order);
  const values: Record<LogisticsCoreExportField, string | number> = {
    orderNo: order.orderNo,
    recipientName: order.recipientName ?? "",
    recipientPhone: order.recipientPhone ?? "",
    recipientEmail: order.recipientEmail ?? "",
    recipientCountryCode: order.recipientCountryCode ?? "",
    recipientPostalCode: order.recipientPostalCode ?? "",
    recipientRegion: structuredAddress.region,
    recipientCity: order.recipientCity ?? "",
    recipientDistrict: structuredAddress.district,
    recipientStreet: structuredAddress.street,
    recipientHouseNumber: structuredAddress.houseNumber,
    recipientAddress: order.recipientAddress ?? "",
    recipientFullAddress: order.recipientFullAddress ?? "",
    productNames: order.items.map((item) => item.productName).join(" / "),
    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    codAmount: (order.codAmountCents / 100).toFixed(2),
    currency: order.currency,
    customerWhatsapp: order.customerWhatsapp ?? "",
    note: order.note ?? "",
    salesName: order.creatorUser?.fullName || order.creatorUser?.username || "",
    productConfigurations: order.items
      .map((item) => item.productName.trim() || item.sku?.code || "")
      .filter(Boolean)
      .join(" / "),
    productSkus: order.items.map((item) => item.sku?.code).filter(Boolean).join(" / "),
    unitPrice: typeof order.items[0]?.unitPriceCents === "number" ? (order.items[0].unitPriceCents / 100).toFixed(2) : "",
    declaredAmount: Number.isSafeInteger(order.productValueCents) && order.productValueCents > 0
      ? order.productValueCents / 100
      : "",
    shippingRoute: "",
  };
  return values[field as LogisticsCoreExportField];
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export function logisticsBatchHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function createLogisticsBatchNo(now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `LB-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function commonDepartmentId(rows: Array<{ departmentId: string | null }>) {
  const values = [...new Set(rows.map((row) => row.departmentId))];
  return values.length === 1 ? values[0] : null;
}
