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
  requireRecipientAddress: boolean;
  requireSku: boolean;
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

  return {
    currency: shortText(value.currency, "CNY").toUpperCase().slice(0, 3),
    logisticsChannel: shortText(value.logisticsChannel, ""),
    paymentMethod: shortText(value.paymentMethod, "COD"),
    defaultShippingFeeCents: cents(value.defaultShippingFeeCents),
    defaultCodAmountCents: cents(value.defaultCodAmountCents),
    requireCodAmount: value.requireCodAmount !== false,
    requireRecipientPhone: value.requireRecipientPhone !== false,
    requireRecipientAddress: value.requireRecipientAddress !== false,
    requireSku: value.requireSku !== false,
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
