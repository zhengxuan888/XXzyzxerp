const UNSIGNED_INTEGER = /^(0|[1-9]\d*)$/;
const DECIMAL_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d+))?$/;
const GROUPED_DECIMAL_AMOUNT = /^(0|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d+))?$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

export class FinanceMoneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceMoneyValidationError";
  }
}

/**
 * Parses an amount already expressed in the smallest currency unit. String
 * input deliberately never passes through Number(), so a workbook/accounting
 * value cannot be silently rounded into a different financial fact.
 */
export function parseMinorAmount(value: unknown, fieldName = "amountCents", options?: { allowZero?: boolean }) {
  const allowZero = options?.allowZero ?? false;
  let parsed: bigint;

  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!UNSIGNED_INTEGER.test(normalized)) {
      throw new FinanceMoneyValidationError(`${fieldName} 必须是最小货币单位的非负整数字符串。`);
    }
    parsed = BigInt(normalized);
  } else {
    throw new FinanceMoneyValidationError(`${fieldName} 必须是最小货币单位的非负整数。`);
  }

  if (parsed < ZERO || (!allowZero && parsed === ZERO)) {
    throw new FinanceMoneyValidationError(`${fieldName} 必须大于 0。`);
  }
  return parsed;
}

export function parseCurrencyScale(value: unknown, fieldName = "currencyScale") {
  if (value === undefined || value === null || value === "") return 2;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 6) {
    throw new FinanceMoneyValidationError(`${fieldName} 必须是 0 到 6 之间的整数。`);
  }
  return parsed;
}

/**
 * Parses a human-readable decimal amount without routing it through a JS
 * floating-point number. This is intentionally strict about locale ambiguity:
 * `1,234.56` is accepted, while `1.234,56` must be normalized by the template
 * owner before import rather than guessed incorrectly.
 */
export function parseDecimalAmountToMinor(
  value: unknown,
  currencyScale: number,
  fieldName = "amount",
  options?: { allowZero?: boolean },
) {
  const allowZero = options?.allowZero ?? false;
  if (typeof value !== "string") {
    throw new FinanceMoneyValidationError(`${fieldName} 必须是文本格式的十进制金额。`);
  }
  const compact = value.trim().replace(/[\u00a0\s]/g, "");
  if (!compact || /[eE]/.test(compact) || compact.startsWith("+") || compact.startsWith("-")) {
    throw new FinanceMoneyValidationError(`${fieldName} 不能使用科学计数法、正负号或空值。`);
  }
  const grouped = GROUPED_DECIMAL_AMOUNT.exec(compact);
  const plain = DECIMAL_AMOUNT.exec(compact);
  const normalized = grouped ? compact.replace(/,/g, "") : compact;
  const match = grouped ?? plain;
  if (!match || (compact.includes(",") && !grouped)) {
    throw new FinanceMoneyValidationError(`${fieldName} 必须是非负十进制金额；仅支持英文小数点和三位逗号分组。`);
  }
  const [, wholePart, fractionPart = ""] = DECIMAL_AMOUNT.exec(normalized) ?? [];
  if (!wholePart || fractionPart.length > currencyScale) {
    throw new FinanceMoneyValidationError(`${fieldName} 的小数位超过当前币种精度。`);
  }
  let multiplier = ONE;
  for (let index = 0; index < currencyScale; index += 1) multiplier *= TEN;
  const fraction = currencyScale > 0
    ? BigInt((fractionPart || "").padEnd(currencyScale, "0") || "0")
    : ZERO;
  const amount = BigInt(wholePart) * multiplier + fraction;
  if (!allowZero && amount === ZERO) {
    throw new FinanceMoneyValidationError(`${fieldName} 必须大于 0。`);
  }
  return amount;
}

function groupThousands(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMinorAmount(value: bigint | string | number, currency: string, currencyScale = 2) {
  const amount = typeof value === "bigint"
    ? value
    : typeof value === "number"
      ? BigInt(value)
      : BigInt(value);
  const sign = amount < ZERO ? "-" : "";
  const absolute = amount < ZERO ? -amount : amount;
  let divisor = ONE;
  for (let index = 0; index < currencyScale; index += 1) {
    divisor *= TEN;
  }
  const whole = absolute / divisor;
  const fraction = currencyScale > 0
    ? `.${(absolute % divisor).toString().padStart(currencyScale, "0")}`
    : "";
  return `${sign}${currency.toUpperCase()} ${groupThousands(whole.toString())}${fraction}`;
}

export function serializeMinorAmount(value: bigint | number | string) {
  return typeof value === "bigint" ? value.toString() : String(value);
}
