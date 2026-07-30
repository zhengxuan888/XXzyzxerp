import { describe, expect, it } from "vitest";

import {
  canCancelFinanceStatementImport,
  normalizeFinanceStatementImportCancellationReason,
} from "@/lib/finance/import-lifecycle";

describe("finance statement import cancellation lifecycle", () => {
  it("allows only a not-yet-confirmed preview to be cancelled", () => {
    expect(canCancelFinanceStatementImport("PREVIEWED")).toBe(true);
    expect(canCancelFinanceStatementImport("IMPORTING")).toBe(false);
    expect(canCancelFinanceStatementImport("IMPORTED")).toBe(false);
    expect(canCancelFinanceStatementImport("CANCELLED")).toBe(false);
  });

  it("requires a bounded cancellation reason", () => {
    expect(normalizeFinanceStatementImportCancellationReason("  修正模板表头后重新预检  "))
      .toBe("修正模板表头后重新预检");
    expect(() => normalizeFinanceStatementImportCancellationReason(" ")).toThrow("取消原因");
    expect(() => normalizeFinanceStatementImportCancellationReason("x".repeat(501))).toThrow("取消原因");
  });
});
