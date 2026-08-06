import { createHash, randomUUID } from "node:crypto";

import type { LogisticsCoreExportField, LogisticsExportField } from "@/lib/logistics-provider-template";

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
  recipientAddress: string | null;
  recipientFullAddress?: string | null;
  codAmountCents: number;
  currency: string;
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

export function exportFieldValue(order: BatchExportOrder, field: LogisticsExportField): string | number {
  if (field.startsWith("custom:")) return customFieldValue(order.customFields, field.slice("custom:".length));
  if (field.startsWith("constant:")) return field.slice("constant:".length);
  const values: Record<LogisticsCoreExportField, string | number> = {
    orderNo: order.orderNo,
    recipientName: order.recipientName ?? "",
    recipientPhone: order.recipientPhone ?? "",
    recipientEmail: order.recipientEmail ?? "",
    recipientCountryCode: order.recipientCountryCode ?? "",
    recipientPostalCode: order.recipientPostalCode ?? "",
    recipientRegion: order.recipientRegion ?? "",
    recipientCity: order.recipientCity ?? "",
    recipientAddress: order.recipientAddress ?? "",
    recipientFullAddress: order.recipientFullAddress ?? order.recipientAddress ?? "",
    productNames: order.items.map((item) => item.productName).join(" / "),
    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    codAmount: (order.codAmountCents / 100).toFixed(2),
    currency: order.currency,
    customerWhatsapp: order.customerWhatsapp ?? "",
    note: order.note ?? "",
    salesName: order.creatorUser?.fullName || order.creatorUser?.username || "",
    productSkus: order.items.map((item) => item.sku?.code).filter(Boolean).join(" / "),
    unitPrice: typeof order.items[0]?.unitPriceCents === "number" ? (order.items[0].unitPriceCents / 100).toFixed(2) : "",
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
