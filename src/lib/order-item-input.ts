export type ParsedOrderItem = {
  productId: string | null;
  quantity: number;
  unitPriceCents: number;
  productName: string;
  skuId: string | null;
};

export type SingleItemPayload = {
  productId?: unknown;
  productName?: unknown;
  quantity?: unknown;
  unitPriceCents?: unknown;
  skuId?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseItem(value: unknown): ParsedOrderItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const productId = text(item.productId) || null;
  const productName = text(item.productName);
  const skuId = text(item.skuId) || null;
  const quantity = Number(item.quantity);
  const unitPriceCents = Number(item.unitPriceCents);

  if (!productName || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null;

  return { productId, productName, skuId, quantity, unitPriceCents };
}

/**
 * Parses the multi-line entry form. A product link is deliberately optional:
 * an ecommerce recipient can be recorded with a manually entered product name
 * when the active order template does not require stock/SKU control.
 */
export function parseOrderItems(raw: unknown): ParsedOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = parseItem(item);
    return parsed ? [parsed] : [];
  });
}

/**
 * Parses the current one-page sales form. Customer identity is intentionally
 * not a required input: the order API resolves or creates the customer from
 * the hand-entered recipient details inside the active business-unit scope.
 */
export function parseSingleOrderItem(body: SingleItemPayload | null): ParsedOrderItem[] {
  const parsed = parseItem(body);
  return parsed ? [parsed] : [];
}
