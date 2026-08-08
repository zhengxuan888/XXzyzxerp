import type { Worksheet } from "exceljs";

import type { LogisticsTemplateColumn } from "@/lib/logistics-provider-template";
import { hasCustomerOriginalAddress } from "@/lib/order-address";

export const HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES = [
  "HONGYA_IBERIA_DROPSHIP",
  "HONGYA_EAST_EU_DROPSHIP",
] as const;

export const ORIGINAL_ADDRESS_REVIEW_HEADER = "完整原始地址（核对后删除）";
export const ORIGINAL_ADDRESS_REVIEW_NOTE = "此列仅供售后核对。发送给物流商前，请删除整列（不是只清空内容）。";

export type LogisticsExportColumnPresentation = {
  width: number;
  wrapText: boolean;
  headerFill: string | null;
  headerFontColor: string | null;
  bodyFill: string | null;
  note: string | null;
};

const defaultColumnPresentation: LogisticsExportColumnPresentation = {
  width: 18,
  wrapText: false,
  headerFill: null,
  headerFontColor: null,
  bodyFill: null,
  note: null,
};

const originalAddressColumnPresentation: LogisticsExportColumnPresentation = {
  width: 48,
  wrapText: true,
  headerFill: "E11D48",
  headerFontColor: "FFFFFF",
  bodyFill: "FFF1F2",
  note: ORIGINAL_ADDRESS_REVIEW_NOTE,
};

export function isHongyaAddressReviewTemplate(code: string) {
  return (HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES as readonly string[]).includes(code);
}

export function logisticsExportFilename(templateCode: string, date: string) {
  const safeCode = templateCode.replace(/[^A-Z0-9_-]/g, "_");
  const reviewMarker = isHongyaAddressReviewTemplate(templateCode)
    ? "-REVIEW-INCLUDES-ORIGINAL-ADDRESS"
    : "";
  return `${safeCode}${reviewMarker}-${date}.xlsx`;
}

/**
 * Hongya's review workbook must contain one, and only one, copy of the source
 * address. Keep it beside the structured street address so reviewers can
 * compare the two without searching across the sheet.
 */
export function normalizeLogisticsExportColumns(
  templateCode: string,
  columns: readonly LogisticsTemplateColumn[],
): LogisticsTemplateColumn[] {
  if (!isHongyaAddressReviewTemplate(templateCode)) return columns.map((column) => ({ ...column }));

  const normalized = columns
    .filter((column) => column.field !== "recipientFullAddress")
    .map((column) => ({ ...column }));
  const reviewColumn: LogisticsTemplateColumn = {
    field: "recipientFullAddress",
    header: ORIGINAL_ADDRESS_REVIEW_HEADER,
  };
  const structuredAddressIndex = normalized.findIndex((column) => column.field === "recipientAddress");
  if (structuredAddressIndex < 0) return [...normalized, reviewColumn];
  return [
    ...normalized.slice(0, structuredAddressIndex + 1),
    reviewColumn,
    ...normalized.slice(structuredAddressIndex + 1),
  ];
}

export function logisticsExportColumnPresentation(
  templateCode: string,
  field: LogisticsTemplateColumn["field"],
): LogisticsExportColumnPresentation {
  if (isHongyaAddressReviewTemplate(templateCode) && field === "recipientFullAddress") {
    return { ...originalAddressColumnPresentation };
  }
  if (field === "recipientAddress") return { ...defaultColumnPresentation, width: 36, wrapText: true };
  if (field === "productConfigurations" || field === "productNames") {
    return { ...defaultColumnPresentation, width: 40, wrapText: true };
  }
  if (field === "recipientEmail") return { ...defaultColumnPresentation, width: 30 };
  if (field === "recipientName" || field === "orderNo") return { ...defaultColumnPresentation, width: 22 };
  if (field === "salesName") return { ...defaultColumnPresentation, width: 16 };
  return { ...defaultColumnPresentation };
}

export function applyLogisticsExportPresentation(
  sheet: Worksheet,
  columns: readonly LogisticsTemplateColumn[],
  templateCode: string,
) {
  columns.forEach((column, index) => {
    const presentation = logisticsExportColumnPresentation(templateCode, column.field);
    const worksheetColumn = sheet.getColumn(index + 1);
    worksheetColumn.width = presentation.width;
    if (!presentation.wrapText && !presentation.headerFill && !presentation.note) return;

    worksheetColumn.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      cell.alignment = { ...cell.alignment, vertical: "top", wrapText: presentation.wrapText };
      if (rowNumber > 1 && presentation.bodyFill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${presentation.bodyFill}` } };
      }
    });
    const headerCell = sheet.getCell(1, index + 1);
    if (isHongyaAddressReviewTemplate(templateCode) && column.field === "recipientFullAddress") {
      headerCell.value = ORIGINAL_ADDRESS_REVIEW_HEADER;
    }
    if (presentation.headerFill) {
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${presentation.headerFill}` } };
    }
    if (presentation.headerFontColor) {
      headerCell.font = { ...headerCell.font, bold: true, color: { argb: `FF${presentation.headerFontColor}` } };
    }
    if (presentation.note) headerCell.note = presentation.note;
  });
  sheet.getRow(1).height = Math.max(sheet.getRow(1).height ?? 0, 32);
}

type AddressReviewOrder = {
  orderNo: string;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientCountryCode: string | null;
  recipientCity: string | null;
  recipientPostalCode: string | null;
  recipientAddress: string | null;
  recipientFullAddress?: string | null;
  recipientFullAddressSource?: string | null;
};

const requiredAddressFields: Array<[keyof AddressReviewOrder, string]> = [
  ["recipientName", "收件人姓名"],
  ["recipientPhone", "收件人电话"],
  ["recipientCountryCode", "目的国家"],
  ["recipientCity", "收件人城市"],
  ["recipientPostalCode", "收件人邮编"],
  ["recipientAddress", "收件人地址"],
];

const customerOriginalAddressLabel = "完整原始地址（需补录客户原文）";

export type LogisticsAddressReviewIssue = {
  orderNo: string;
  missingFields: string[];
};

export type LogisticsShippingRouteIssue = {
  orderNo: string;
  countryCode: string;
};

export function findLogisticsAddressReviewIssues(
  templateCode: string,
  orders: readonly AddressReviewOrder[],
): LogisticsAddressReviewIssue[] {
  if (!isHongyaAddressReviewTemplate(templateCode)) return [];
  return orders.flatMap((order) => {
    const missingFields = requiredAddressFields.flatMap(([field, label]) => {
      const value = order[field];
      return typeof value === "string" && value.trim() ? [] : [label];
    });
    if (
      typeof order.recipientFullAddress !== "string"
      || !order.recipientFullAddress.trim()
      || !hasCustomerOriginalAddress(order.recipientFullAddressSource)
    ) {
      missingFields.push(customerOriginalAddressLabel);
    }
    return missingFields.length ? [{ orderNo: order.orderNo, missingFields }] : [];
  });
}

export function findMissingLogisticsShippingRoutes(
  columns: readonly LogisticsTemplateColumn[],
  countryRoutes: Readonly<Record<string, string>>,
  orders: readonly Pick<AddressReviewOrder, "orderNo" | "recipientCountryCode">[],
): LogisticsShippingRouteIssue[] {
  if (!columns.some((column) => column.field === "shippingRoute")) return [];
  return orders.flatMap((order) => {
    const countryCode = order.recipientCountryCode?.trim().toUpperCase() ?? "";
    const route = countryRoutes[countryCode]?.trim();
    return route ? [] : [{ orderNo: order.orderNo, countryCode: countryCode || "未填写国家" }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function logisticsBatchSnapshotRequiresOriginalAddressRemoval(snapshot: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.configuration)) return false;
  const columns = snapshot.configuration.columns;
  return Array.isArray(columns) && columns.some((column) => isRecord(column) && column.field === "recipientFullAddress");
}
