export type OrderCustomField = {
  key: string;
  label: string;
  type: "text" | "number";
  required: boolean;
};

export type OrderTemplateConfiguration = {
  currency: string;
  logisticsChannel: string;
  paymentMethod: string;
  defaultShippingFeeCents: number;
  defaultCodAmountCents: number;
  requireCodAmount: boolean;
  requireRecipientPhone: boolean;
  requireShopId: boolean;
  requireRecipientAddress: boolean;
  requireRecipientEmail: boolean;
  requireSku: boolean;
  requireRecipientCountryCode: boolean;
  requireRecipientPostalCode: boolean;
  requireRecipientRegion: boolean;
  requireRecipientCity: boolean;
  requireProductName: boolean;
  requirePackageWeight: boolean;
  reviewRejectReasons: string[];
  voidReasons: string[];
  customFields: OrderCustomField[];
};

const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,49}$/;

export function parseOrderTemplateConfiguration(raw: unknown): OrderTemplateConfiguration {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const customFields = Array.isArray(value.customFields)
    ? value.customFields.flatMap((item): OrderCustomField[] => {
        if (!item || typeof item !== "object") return [];
        const field = item as Record<string, unknown>;
        const key = typeof field.key === "string" ? field.key.trim() : "";
        const label = typeof field.label === "string" ? field.label.trim() : "";
        if (!FIELD_KEY.test(key) || !label || label.length > 50) return [];
        return [{
          key,
          label,
          type: field.type === "number" ? "number" : "text",
          required: field.required === true,
        }];
      }).slice(0, 20)
    : [];

  const cents = (input: unknown) => {
    const value = Number(input ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  const shortText = (input: unknown, fallback: string) =>
    typeof input === "string" && input.trim() ? input.trim().slice(0, 50) : fallback;
  const bool = (value: unknown, fallback = false) => {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return fallback;
  };
  const reasonList = (input: unknown, fallback: string[]) => {
    if (!Array.isArray(input)) return fallback;
    const unique = new Set(
      input
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 100))
        .filter(Boolean),
    );
    return [...unique].slice(0, 20);
  };

  return {
    currency: shortText(value.currency, "CNY").toUpperCase().slice(0, 3),
    logisticsChannel: shortText(value.logisticsChannel, ""),
    paymentMethod: shortText(value.paymentMethod, "COD"),
    defaultShippingFeeCents: cents(value.defaultShippingFeeCents),
    defaultCodAmountCents: cents(value.defaultCodAmountCents),
    requireCodAmount: value.requireCodAmount !== false,
  requireRecipientPhone: value.requireRecipientPhone !== false,
  requireShopId: bool((value as Record<string, unknown>).requireShopId, false),
  requireRecipientAddress: value.requireRecipientAddress !== false,
  requireRecipientEmail: bool((value as Record<string, unknown>).requireRecipientEmail, false),
  requireSku: value.requireSku !== false,
    requireRecipientCountryCode: bool((value as Record<string, unknown>).requireRecipientCountryCode, false),
    requireRecipientPostalCode: bool((value as Record<string, unknown>).requireRecipientPostalCode, false),
    requireRecipientRegion: bool((value as Record<string, unknown>).requireRecipientRegion, false),
    requireRecipientCity: bool((value as Record<string, unknown>).requireRecipientCity, false),
    requireProductName: bool((value as Record<string, unknown>).requireProductName, true),
    requirePackageWeight: bool((value as Record<string, unknown>).requirePackageWeight, false),
    reviewRejectReasons: reasonList(value.reviewRejectReasons, [
      "客户信息不完整",
      "地址或邮编有误",
      "商品或数量需确认",
      "COD 金额有误",
      "沟通凭证不完整",
      "疑似重复订单",
    ]),
    voidReasons: reasonList(value.voidReasons, [
      "客户明确取消",
      "重复订单",
      "测试或无效订单",
      "无法联系客户",
      "不符合发货条件",
    ]),
    customFields,
  };
}

export function sanitizeOrderCustomValues(
  raw: unknown,
  fields: OrderCustomField[],
): { values: Record<string, string | number>; missing: string[] } {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: Record<string, string | number> = {};
  const missing: string[] = [];
  for (const field of fields) {
    const rawValue = source[field.key];
    if (field.type === "number") {
      const numberValue = Number(rawValue);
      if (rawValue !== "" && Number.isFinite(numberValue)) values[field.key] = numberValue;
    } else if (typeof rawValue === "string" && rawValue.trim()) {
      values[field.key] = rawValue.trim().slice(0, 500);
    }
    if (field.required && values[field.key] === undefined) missing.push(field.label);
  }
  return { values, missing };
}
