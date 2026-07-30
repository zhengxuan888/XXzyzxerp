import { Prisma } from "@prisma/client";

import { fail } from "@/lib/api-response";
import { FinanceMoneyValidationError } from "@/lib/finance/money";
import { FinanceServiceError } from "@/lib/finance/settlement-service";
import { FinanceStateError } from "@/lib/finance/state";

/**
 * Keeps finance failures predictable without returning internal database or
 * permission details to the browser. API routes use this after service-layer
 * validation, state transitions, and serializable transactions.
 */
export function financeErrorResponse(error: unknown) {
  if (error instanceof FinanceServiceError) {
    return fail(error.code, error.message, error.status);
  }
  if (error instanceof FinanceMoneyValidationError) {
    return fail("INVALID_MONEY_AMOUNT", error.message, 400);
  }
  if (error instanceof FinanceStateError) {
    return fail("INVALID_FINANCE_TRANSITION", error.message, 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail("FINANCE_UNIQUE_CONFLICT", "编号或关联记录已存在，请刷新后核对。", 409);
    }
    if (error.code === "P2034") {
      return fail("FINANCE_RETRY_REQUIRED", "记录刚被其他人员处理，请刷新后重试。", 409);
    }
    if (error.code === "P2025") {
      return fail("FINANCE_RECORD_NOT_FOUND", "记录不存在或已发生变化。", 404);
    }
  }
  return fail("FINANCE_INTERNAL_ERROR", "财务操作未完成，请稍后重试。", 500);
}

export function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
