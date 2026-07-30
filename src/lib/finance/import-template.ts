import { FinanceStatementType } from "@prisma/client";

import { parseCurrencyScale } from "@/lib/finance/money";

const statementTypes = new Set(Object.values(FinanceStatementType));
const TEMPLATE_CODE = /^[A-Z0-9][A-Z0-9_-]{0,59}$/;
const TEMPLATE_SHEET_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_ALIAS_COUNT = 16;
const MAX_ALIAS_LENGTH = 120;

export const financeStatementTemplateFields = [
  "sourceReference",
  "trackingReference",
  "amount",
  "description",
] as const;

export type FinanceStatementTemplateField = (typeof financeStatementTemplateFields)[number];

export type FinanceStatementImportSheetRule = {
  key: string;
  sheetAliases: string[];
  headerScanRows: number;
  dataStartOffset: number;
  skipIfFirstCellMatches: string[];
  statementType: FinanceStatementType;
  currency: string;
  currencyScale: number;
  statementNoSuffix: string;
  aliases: Record<FinanceStatementTemplateField, string[]>;
};

export type FinanceStatementTemplateConfiguration = {
  sheets: FinanceStatementImportSheetRule[];
};

export class FinanceStatementTemplateValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FinanceStatementTemplateValidationError";
  }
}

function object(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", message);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, max = 160) {
  if (typeof value !== "string") {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 必须是文本。`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max || normalized.includes("\0")) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 长度或格式不正确。`);
  }
  return normalized;
}

function optionalString(value: unknown, field: string, max = 80) {
  if (value === undefined || value === null || value === "") return "";
  return string(value, field, max);
}

function boundedInteger(value: unknown, field: string, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 必须是 ${min} 到 ${max} 的整数。`);
  }
  return value;
}

function strings(value: unknown, field: string, required: boolean) {
  if (value === undefined || value === null) {
    if (required) throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 至少需要一个别名。`);
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_ALIAS_COUNT) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 格式不正确或数量过多。`);
  }
  const result = value.map((item) => string(item, field, MAX_ALIAS_LENGTH));
  const normalized = new Set(result.map(normalizeWorkbookLabel));
  if ((required && !result.length) || normalized.has("")) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 至少需要一个有效别名。`);
  }
  if (normalized.size !== result.length) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${field} 存在重复别名。`);
  }
  return result;
}

export function normalizeWorkbookLabel(value: string) {
  return value
    .replace(/[\s\u00a0\-_./\\()[\]{}:：;；,，。'"“”‘’]/g, "")
    .toLocaleLowerCase();
}

export function financeHeaderMatchesAlias(value: string, aliases: string[]) {
  const normalized = normalizeWorkbookLabel(value);
  return Boolean(normalized) && aliases.some((alias) => normalizeWorkbookLabel(alias) === normalized);
}

function validateMappings(value: unknown, sheetKey: string): Record<FinanceStatementTemplateField, string[]> {
  const raw = object(value, `工作表 ${sheetKey} 的 aliases 必须是对象。`);
  const aliases = {
    sourceReference: strings(raw.sourceReference, `${sheetKey}.aliases.sourceReference`, true),
    trackingReference: strings(raw.trackingReference, `${sheetKey}.aliases.trackingReference`, false),
    amount: strings(raw.amount, `${sheetKey}.aliases.amount`, true),
    description: strings(raw.description, `${sheetKey}.aliases.description`, false),
  } satisfies Record<FinanceStatementTemplateField, string[]>;
  return aliases;
}

function parseSheet(value: unknown): FinanceStatementImportSheetRule {
  const raw = object(value, "每个工作表规则必须是对象。");
  const key = string(raw.key, "工作表 key", 64);
  if (!TEMPLATE_SHEET_KEY.test(key)) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "工作表 key 仅支持小写字母、数字和下划线，并且必须以字母开头。");
  }
  const sheetAliases = strings(raw.sheetAliases, `${key}.sheetAliases`, true);
  const statementTypeRaw = string(raw.statementType, `${key}.statementType`, 40);
  if (!statementTypes.has(statementTypeRaw as FinanceStatementType)) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${key}.statementType 不受支持。`);
  }
  const currency = string(raw.currency, `${key}.currency`, 3).toUpperCase();
  if (!CURRENCY.test(currency)) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${key}.currency 必须是三位币种代码。`);
  }
  let currencyScale: number;
  try {
    if (raw.currencyScale !== undefined && (typeof raw.currencyScale !== "number" || !Number.isSafeInteger(raw.currencyScale))) {
      throw new Error("not an integer");
    }
    currencyScale = parseCurrencyScale(raw.currencyScale, `${key}.currencyScale`);
  } catch {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", `${key}.currencyScale 必须是 0 到 6 的整数。`);
  }
  const skipIfFirstCellMatches = strings(raw.skipIfFirstCellMatches, `${key}.skipIfFirstCellMatches`, false);
  return {
    key,
    sheetAliases,
    headerScanRows: boundedInteger(raw.headerScanRows, `${key}.headerScanRows`, 20, 1, 50),
    dataStartOffset: boundedInteger(raw.dataStartOffset, `${key}.dataStartOffset`, 1, 1, 10),
    skipIfFirstCellMatches,
    statementType: statementTypeRaw as FinanceStatementType,
    currency,
    currencyScale,
    statementNoSuffix: optionalString(raw.statementNoSuffix, `${key}.statementNoSuffix`, 40),
    aliases: validateMappings(raw.aliases, key),
  };
}

/**
 * Validates and normalizes a data-only workbook mapping. No functions,
 * formulas, dynamic expressions or provider-specific branches are accepted.
 */
export function parseFinanceStatementTemplateConfiguration(value: unknown): FinanceStatementTemplateConfiguration {
  const raw = object(value, "账单模板配置必须是对象。");
  if (!Array.isArray(raw.sheets) || raw.sheets.length < 1 || raw.sheets.length > 10) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "账单模板必须配置 1 到 10 个工作表规则。");
  }
  const sheets = raw.sheets.map(parseSheet);
  const sheetKeys = new Set(sheets.map((sheet) => sheet.key));
  if (sheetKeys.size !== sheets.length) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "账单模板存在重复的工作表 key。");
  }
  const allSheetAliases = new Set<string>();
  for (const sheet of sheets) {
    for (const alias of sheet.sheetAliases) {
      const normalized = normalizeWorkbookLabel(alias);
      if (allSheetAliases.has(normalized)) {
        throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "不同工作表规则不能使用相同的工作表别名。");
      }
      allSheetAliases.add(normalized);
    }
  }
  if (sheets.length > 1) {
    const statementNumbers = new Set<string>();
    for (const sheet of sheets) {
      if (!sheet.statementNoSuffix) {
        throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "多工作表模板的每张表都必须设置唯一的 statementNoSuffix。");
      }
      if (statementNumbers.has(sheet.statementNoSuffix)) {
        throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CONFIGURATION", "多工作表模板的 statementNoSuffix 不能重复。");
      }
      statementNumbers.add(sheet.statementNoSuffix);
    }
  }
  return { sheets };
}

export function normalizeFinanceTemplateCode(value: unknown) {
  const code = string(value, "模板编码", 60).toUpperCase();
  if (!TEMPLATE_CODE.test(code)) {
    throw new FinanceStatementTemplateValidationError("INVALID_TEMPLATE_CODE", "模板编码仅支持大写字母、数字、下划线和短横线。");
  }
  return code;
}
