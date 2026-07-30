import type { FinanceStatementImportBatchStatus } from "@prisma/client";

import { FinanceServiceError } from "@/lib/finance/settlement-service";

/**
 * A cancelled preview is retained as an audit record, but it no longer blocks
 * a corrected source file from being preflighted again. Imported batches are
 * financial evidence and can never be cancelled through this workflow.
 */
export function canCancelFinanceStatementImport(status: FinanceStatementImportBatchStatus) {
  return status === "PREVIEWED";
}

export function normalizeFinanceStatementImportCancellationReason(value: unknown) {
  if (typeof value !== "string") {
    throw new FinanceServiceError("INVALID_CANCELLATION_REASON", "请填写取消预检的原因。", 400);
  }
  const reason = value.trim();
  if (!reason || reason.length > 500 || reason.includes("\0")) {
    throw new FinanceServiceError("INVALID_CANCELLATION_REASON", "取消原因不能为空且不能超过 500 个字符。", 400);
  }
  return reason;
}
