export const DECLARATION_CURRENCY = "EUR";
export const DECLARATION_RATIO_PERCENT = 10;

// Fixed business conversion rates: units of the order currency per EUR.
// Initial values use the ECB euro reference rates published on 2026-07-28.
const UNITS_PER_EUR_SCALED: Record<string, number> = {
  EUR: 10_000,
  PLN: 43_265,
  CZK: 241_870,
  RON: 52_319,
};

export function declarationAmountEurCents(codAmountCents: number, currency: string) {
  if (!Number.isSafeInteger(codAmountCents) || codAmountCents < 0) {
    throw new Error("INVALID_COD_AMOUNT");
  }
  const normalized = currency.trim().toUpperCase();
  const rate = UNITS_PER_EUR_SCALED[normalized];
  if (!rate) throw new Error(`DECLARATION_RATE_NOT_CONFIGURED:${normalized}`);
  return Math.round((codAmountCents * 1_000) / rate);
}

export function declarationPreview(codAmount: number, currency: string) {
  if (!Number.isFinite(codAmount) || codAmount < 0) return 0;
  try {
    return declarationAmountEurCents(Math.round(codAmount * 100), currency) / 100;
  } catch {
    return 0;
  }
}
