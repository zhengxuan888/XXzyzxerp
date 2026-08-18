import type { Worksheet } from "exceljs";

import { resolveStructuredAddressForExport } from "@/lib/logistics-batch";
import type { LogisticsTemplateColumn } from "@/lib/logistics-provider-template";
import {
  HONGYA_FORWARD_TEMPLATE_CODES,
  isHongyaAddressReviewTemplate,
} from "@/lib/logistics-template-policy";
import { hasCustomerOriginalAddress } from "@/lib/order-address";

export {
  HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES,
  HONGYA_FORWARD_TEMPLATE_CODES,
  isHongyaAddressReviewTemplate,
} from "@/lib/logistics-template-policy";

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

export function logisticsExportFilename(templateCode: string, date: string) {
  const filenameCode = templateCode === "（鸿亚）东欧转寄"
    ? "HONGYA_EAST_EU_FORWARD"
    : templateCode;
  const safeCode = filenameCode.replace(/[^A-Z0-9_-]/g, "_");
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
  const structuredAddressFields = new Set<LogisticsTemplateColumn["field"]>([
    "recipientAddress",
    "recipientStreet",
    "recipientHouseNumber",
    "custom:streetNumber",
  ]);
  const structuredAddressIndex = normalized.reduce(
    (lastIndex, column, index) => structuredAddressFields.has(column.field) ? index : lastIndex,
    -1,
  );
  if (structuredAddressIndex < 0) return [...normalized, reviewColumn];
  return [
    ...normalized.slice(0, structuredAddressIndex + 1),
    reviewColumn,
    ...normalized.slice(structuredAddressIndex + 1),
  ];
}

export function ensureLogisticsExportNoteColumn(
  columns: readonly LogisticsTemplateColumn[],
): LogisticsTemplateColumn[] {
  if (columns.some((column) => column.field === "note")) return columns.map((column) => ({ ...column }));
  return [...columns.map((column) => ({ ...column })), { field: "note", header: "录单人备注" }];
}

export function logisticsExportColumnPresentation(
  templateCode: string,
  field: LogisticsTemplateColumn["field"],
): LogisticsExportColumnPresentation {
  if (isHongyaAddressReviewTemplate(templateCode) && field === "recipientFullAddress") {
    return { ...originalAddressColumnPresentation };
  }
  if (field === "recipientStreet") return { ...defaultColumnPresentation, width: 30, wrapText: true };
  if (field === "recipientDistrict" || field === "recipientHouseNumber") {
    return { ...defaultColumnPresentation, width: 20, wrapText: true };
  }
  if (field === "recipientAddress") return { ...defaultColumnPresentation, width: 36, wrapText: true };
  if (field === "productConfigurations" || field === "productNames") {
    return { ...defaultColumnPresentation, width: 40, wrapText: true };
  }
  if (field === "recipientEmail") return { ...defaultColumnPresentation, width: 30 };
  if (field === "recipientName" || field === "orderNo") return { ...defaultColumnPresentation, width: 22 };
  if (field === "salesName") return { ...defaultColumnPresentation, width: 16 };
  if (field === "declarationAmount") return { ...defaultColumnPresentation, width: 16 };
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
    if (column.field === "declarationAmount") worksheetColumn.numFmt = "0.00";
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
  recipientRegion?: string | null;
  recipientCity: string | null;
  recipientDistrict?: string | null;
  recipientStreet?: string | null;
  recipientHouseNumber?: string | null;
  recipientPostalCode: string | null;
  recipientAddress: string | null;
  recipientFullAddress?: string | null;
  recipientFullAddressSource?: string | null;
  customFields?: unknown;
};

const requiredAddressFields: Array<[keyof AddressReviewOrder, string]> = [
  ["recipientName", "收件人姓名"],
  ["recipientPhone", "收件人电话"],
  ["recipientCountryCode", "目的国家"],
  ["recipientCity", "收件人城市"],
  ["recipientPostalCode", "收件人邮编"],
  ["recipientAddress", "收件人地址"],
];

const configuredStructuredAddressFields: Array<[keyof AddressReviewOrder, LogisticsTemplateColumn["field"], string]> = [
  ["recipientRegion", "recipientRegion", "收件人州/省"],
  ["recipientStreet", "recipientStreet", "收件人街道"],
  ["recipientHouseNumber", "recipientHouseNumber", "收件人门牌号/楼层房号"],
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

type HongyaForwardDeclarationOrder = {
  orderNo: string;
  productValueCents: number;
  declarationCurrency: string | null;
};

export type HongyaForwardDeclarationIssue = {
  orderNo: string;
  invalidFields: string[];
};

export function findHongyaForwardTemplateDeclarationIssues(
  templateCode: string,
  columns: readonly LogisticsTemplateColumn[],
): string[] {
  if (!(HONGYA_FORWARD_TEMPLATE_CODES as readonly string[]).includes(templateCode)) return [];
  const eastEurope = templateCode !== "HONGYA_IBERIA_FORWARD";
  const required: Array<[number, LogisticsTemplateColumn["field"], string, string]> = [
    [eastEurope ? 17 : 3, "constant:Phone", "海关报关品名1", "海关报关品名1（必须固定 Phone 且列位正确）"],
    [eastEurope ? 18 : 4, "constant:手机", "中文品名1", "中文品名1（必须固定手机且列位正确）"],
    [eastEurope ? 20 : 6, "declarationAmount", eastEurope ? "申报价值1" : "申报金额", "申报金额（必须读取订单申报总额且列位正确）"],
    [eastEurope ? 21 : 7, "constant:EUR", eastEurope ? "申报币种1" : "海关申报币种", "海关申报币种（必须固定 EUR 且列位正确）"],
  ];
  return required.flatMap(([index, field, header, label]) => {
    const headerColumns = columns.filter((column) => column.header === header);
    const positionedColumn = columns[index];
    return headerColumns.length === 1
      && headerColumns[0]?.field === field
      && positionedColumn?.field === field
      && positionedColumn.header === header
      ? []
      : [label];
  });
}

export function findLogisticsAddressReviewIssues(
  templateCode: string,
  orders: readonly AddressReviewOrder[],
  columns: readonly LogisticsTemplateColumn[] = [],
): LogisticsAddressReviewIssue[] {
  if (!isHongyaAddressReviewTemplate(templateCode)) return [];
  const exportedFields = new Set(columns.map((column) => column.field));
  const requiredFields = [
    ...requiredAddressFields,
    ...configuredStructuredAddressFields
      .filter(([, exportField]) => exportedFields.has(exportField))
      .map(([orderField, , label]) => [orderField, label] as [keyof AddressReviewOrder, string]),
  ];
  return orders.flatMap((order) => {
    const structuredAddress = resolveStructuredAddressForExport(order);
    const resolvedValues: Partial<Record<keyof AddressReviewOrder, string>> = {
      recipientRegion: structuredAddress.region,
      recipientDistrict: structuredAddress.district,
      recipientStreet: structuredAddress.street,
      recipientHouseNumber: structuredAddress.houseNumber,
    };
    const missingFields = requiredFields.flatMap(([field, label]) => {
      const value = resolvedValues[field] ?? order[field];
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

export function findHongyaForwardDeclarationIssues(
  templateCode: string,
  orders: readonly HongyaForwardDeclarationOrder[],
): HongyaForwardDeclarationIssue[] {
  if (!(HONGYA_FORWARD_TEMPLATE_CODES as readonly string[]).includes(templateCode)) return [];
  return orders.flatMap((order) => {
    const invalidFields = [
      ...(Number.isSafeInteger(order.productValueCents) && order.productValueCents > 0 ? [] : ["申报金额"]),
      ...(order.declarationCurrency?.trim().toUpperCase() === "EUR" ? [] : ["申报币种（必须为 EUR）"]),
    ];
    return invalidFields.length ? [{ orderNo: order.orderNo, invalidFields }] : [];
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
