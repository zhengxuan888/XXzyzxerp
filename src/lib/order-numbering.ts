import { randomUUID } from "node:crypto";

import { Prisma, type OrderNumberRule } from "@prisma/client";

export const ORDER_NUMBER_DATE_FORMATS = ["YYYYMMDD", "YYYYMDD", "YYYY-MM-DD", "YYMMDD", "NONE"] as const;
export const ORDER_NUMBER_RESET_PERIODS = ["DAILY", "MONTHLY", "YEARLY", "NEVER"] as const;

export type OrderNumberDateFormat = (typeof ORDER_NUMBER_DATE_FORMATS)[number];
export type OrderNumberResetPeriod = (typeof ORDER_NUMBER_RESET_PERIODS)[number];

export type OrderNumberRuleInput = {
  code: string;
  name: string;
  prefix: string;
  dateFormat: OrderNumberDateFormat;
  timeZone: string;
  includeDepartmentCode: boolean;
  separator: string;
  sequencePadding: number;
  resetPeriod: OrderNumberResetPeriod;
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  departmentId: string | null;
  orderTemplateId: string | null;
};

type RuleLike = Pick<
  OrderNumberRule,
  | "id"
  | "code"
  | "prefix"
  | "dateFormat"
  | "timeZone"
  | "includeDepartmentCode"
  | "separator"
  | "sequencePadding"
  | "resetPeriod"
  | "priority"
  | "isDefault"
  | "departmentId"
  | "orderTemplateId"
  | "createdAt"
>;

export type OrderNumberingContext = {
  legalEntityId: string;
  businessUnitId: string;
  departmentId: string | null;
  orderTemplateId: string | null;
};

export type AllocatedOrderNumber = {
  orderNo: string;
  ruleId: string;
  ruleCode: string;
  sequence: number;
  periodKey: string;
  counterScopeKey: string;
};

export class OrderNumberingError extends Error {
  constructor(
    public readonly code: "ORDER_NUMBER_RULE_REQUIRED" | "ORDER_NUMBER_DEPARTMENT_REQUIRED" | "ORDER_NUMBER_COUNTER_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "OrderNumberingError";
  }
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function int(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function nullableId(value: unknown) {
  const id = text(value, 120);
  return id || null;
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes configuration received from an administrative form. The returned
 * value is deliberately data-only: formatting logic never branches on a
 * company name, business unit name, department name, or role name.
 */
export function parseOrderNumberRuleInput(raw: unknown): { value: OrderNumberRuleInput; errors: string[] } {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const code = text(source.code, 40).toLocaleUpperCase("en-US");
  const name = text(source.name, 80);
  const prefix = text(source.prefix, 20);
  const dateFormat = text(source.dateFormat, 20).toUpperCase() as OrderNumberDateFormat;
  const timeZone = text(source.timeZone, 80) || "UTC";
  const separator = text(source.separator, 3);
  const sequencePadding = int(source.sequencePadding, 1);
  const resetPeriod = text(source.resetPeriod, 20).toUpperCase() as OrderNumberResetPeriod;
  const priority = int(source.priority, 0);
  const errors: string[] = [];

  if (!/^[A-Z][A-Z0-9_-]{1,39}$/.test(code)) errors.push("规则编码需为 2-40 位大写字母、数字、下划线或短横线，且以字母开头。");
  if (!name) errors.push("请填写规则名称。");
  if (!/^[\p{L}\p{N}_-]{0,20}$/u.test(prefix)) errors.push("编号前缀仅支持中英文、数字、下划线或短横线。");
  if (!ORDER_NUMBER_DATE_FORMATS.includes(dateFormat)) errors.push("日期格式无效。");
  if (!isValidTimeZone(timeZone)) errors.push("时区无效，请使用 IANA 时区，例如 Asia/Shanghai。");
  if (!/^[._/-]{0,3}$/.test(separator)) errors.push("分隔符仅支持 -、_、. 或 /，最多 3 个字符。");
  if (sequencePadding < 1 || sequencePadding > 8) errors.push("流水号位数需在 1-8 之间。");
  if (!ORDER_NUMBER_RESET_PERIODS.includes(resetPeriod)) errors.push("流水号重置周期无效。");
  if (priority < -10000 || priority > 10000) errors.push("规则优先级需在 -10000 到 10000 之间。");
  if (dateFormat === "NONE" && resetPeriod !== "NEVER") errors.push("不含日期的编号只能使用“不重置”流水号，避免跨日重复。");
  if (!prefix && dateFormat === "NONE") errors.push("编号至少需要前缀或日期段，不能只保留流水号。");

  return {
    value: {
      code,
      name,
      prefix,
      dateFormat: ORDER_NUMBER_DATE_FORMATS.includes(dateFormat) ? dateFormat : "YYYYMMDD",
      timeZone,
      includeDepartmentCode: bool(source.includeDepartmentCode, false),
      separator,
      sequencePadding,
      resetPeriod: ORDER_NUMBER_RESET_PERIODS.includes(resetPeriod) ? resetPeriod : "DAILY",
      priority,
      isDefault: bool(source.isDefault, false),
      isActive: bool(source.isActive, true),
      departmentId: nullableId(source.departmentId),
      orderTemplateId: nullableId(source.orderTemplateId),
    },
    errors,
  };
}

function dateParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: value.get("year") ?? "0000",
    month: value.get("month") ?? "01",
    day: value.get("day") ?? "01",
  };
}

export function formatOrderNumberDate(at: Date, format: OrderNumberDateFormat, timeZone: string) {
  const { year, month, day } = dateParts(at, timeZone);
  if (format === "NONE") return "";
  if (format === "YYYYMDD") return `${year}${Number(month)}${Number(day)}`;
  if (format === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  if (format === "YYMMDD") return `${year.slice(-2)}${month}${day}`;
  return `${year}${month}${day}`;
}

export function periodKeyForOrderNumber(at: Date, resetPeriod: OrderNumberResetPeriod, timeZone: string) {
  const { year, month, day } = dateParts(at, timeZone);
  if (resetPeriod === "NEVER") return "ALL";
  if (resetPeriod === "YEARLY") return year;
  if (resetPeriod === "MONTHLY") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

export function renderOrderNumber(input: {
  prefix: string;
  dateValue: string;
  departmentCode?: string | null;
  includeDepartmentCode: boolean;
  separator: string;
  sequencePadding: number;
  sequence: number;
}) {
  const firstSegment = `${input.prefix}${input.dateValue}`;
  const segments = [
    firstSegment,
    input.includeDepartmentCode ? input.departmentCode?.trim() ?? "" : "",
    String(input.sequence).padStart(input.sequencePadding, "0"),
  ].filter(Boolean);
  return segments.join(input.separator);
}

/** Picks the most specific applicable rule. A department/template specific
 * rule beats a general rule; priority resolves ties without tying behavior to
 * a named department or role. */
export function chooseOrderNumberRule<T extends RuleLike>(rules: T[], context: Pick<OrderNumberingContext, "departmentId" | "orderTemplateId">): T | null {
  const candidates = rules
    .filter((rule) => (!rule.departmentId || rule.departmentId === context.departmentId) && (!rule.orderTemplateId || rule.orderTemplateId === context.orderTemplateId))
    .map((rule) => ({
      rule,
      specificity: (rule.departmentId ? 2 : 0) + (rule.orderTemplateId ? 2 : 0) + (rule.isDefault ? 1 : 0),
    }))
    .sort((left, right) => right.specificity - left.specificity || right.rule.priority - left.rule.priority || left.rule.createdAt.getTime() - right.rule.createdAt.getTime());
  return candidates[0]?.rule ?? null;
}

async function getDepartmentCode(
  tx: Prisma.TransactionClient,
  context: OrderNumberingContext,
  rule: RuleLike,
) {
  if (!rule.includeDepartmentCode) return null;
  if (!context.departmentId) {
    throw new OrderNumberingError("ORDER_NUMBER_DEPARTMENT_REQUIRED", "当前编号规则要求部门编码，但当前员工没有有效部门归属。");
  }
  const department = await tx.department.findFirst({
    where: { id: context.departmentId, businessUnitId: context.businessUnitId, isActive: true },
    select: { id: true, code: true },
  });
  if (!department?.code) {
    throw new OrderNumberingError("ORDER_NUMBER_DEPARTMENT_REQUIRED", "当前编号规则要求有效部门编码，请先配置员工部门。");
  }
  return department.code;
}

export async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  context: OrderNumberingContext,
  options?: { now?: Date },
): Promise<AllocatedOrderNumber> {
  const rules = await tx.orderNumberRule.findMany({
    where: {
      legalEntityId: context.legalEntityId,
      businessUnitId: context.businessUnitId,
      isActive: true,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  const rule = chooseOrderNumberRule(rules, context);
  if (!rule) {
    throw new OrderNumberingError(
      "ORDER_NUMBER_RULE_REQUIRED",
      "当前业务板块尚未配置可用订单编号规则，请由拥有“订单编号配置”权限的人员先创建规则。",
    );
  }

  const now = options?.now ?? new Date();
  const departmentCode = await getDepartmentCode(tx, context, rule);
  const periodKey = periodKeyForOrderNumber(now, rule.resetPeriod as OrderNumberResetPeriod, rule.timeZone);
  const counterScopeKey = rule.includeDepartmentCode && context.departmentId ? `DEPARTMENT:${context.departmentId}` : "GLOBAL";
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>(Prisma.sql`
    INSERT INTO "OrderNumberCounter" ("id", "ruleId", "periodKey", "scopeKey", "lastValue", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${rule.id}, ${periodKey}, ${counterScopeKey}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ruleId", "periodKey", "scopeKey")
    DO UPDATE SET
      "lastValue" = "OrderNumberCounter"."lastValue" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `);
  const sequence = rows[0]?.lastValue;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new OrderNumberingError("ORDER_NUMBER_COUNTER_FAILED", "订单流水号生成失败，请重试。" );
  }
  return {
    orderNo: renderOrderNumber({
      prefix: rule.prefix,
      dateValue: formatOrderNumberDate(now, rule.dateFormat as OrderNumberDateFormat, rule.timeZone),
      departmentCode,
      includeDepartmentCode: rule.includeDepartmentCode,
      separator: rule.separator,
      sequencePadding: rule.sequencePadding,
      sequence,
    }),
    ruleId: rule.id,
    ruleCode: rule.code,
    sequence,
    periodKey,
    counterScopeKey,
  };
}
