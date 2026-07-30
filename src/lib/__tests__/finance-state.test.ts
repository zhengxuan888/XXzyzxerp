import { describe, expect, it } from "vitest";

import {
  FinanceStateError,
  actionForPaymentCommand,
  actionForStatementCommand,
  nextPaymentState,
  nextStatementState,
} from "../finance/state";

describe("finance statement state machine", () => {
  it("permits the controlled reconciliation and posting path", () => {
    expect(nextStatementState("DRAFT", "start_reconciliation")).toBe("RECONCILING");
    expect(nextStatementState("RECONCILING", "mark_exception")).toBe("EXCEPTION");
    expect(nextStatementState("EXCEPTION", "resume_reconciliation")).toBe("RECONCILING");
    expect(nextStatementState("RECONCILING", "approve")).toBe("APPROVED");
    expect(nextStatementState("APPROVED", "post")).toBe("POSTED");
    expect(nextStatementState("POSTED", "void")).toBe("VOIDED");
  });

  it("rejects skipped and terminal statement transitions", () => {
    expect(() => nextStatementState("DRAFT", "approve")).toThrow(FinanceStateError);
    expect(() => nextStatementState("RECONCILING", "post")).toThrow(FinanceStateError);
    expect(() => nextStatementState("VOIDED", "void")).toThrow(FinanceStateError);
  });

  it("maps statement commands to their independently configurable actions", () => {
    expect(actionForStatementCommand("start_reconciliation")).toBe("finance.reconciliation.resolve");
    expect(actionForStatementCommand("approve")).toBe("finance.settlement.approve");
    expect(actionForStatementCommand("post")).toBe("finance.settlement.post");
    expect(actionForStatementCommand("void")).toBe("finance.settlement.void");
  });
});

describe("finance payment state machine", () => {
  it("permits approval, posting, and explicit voiding", () => {
    expect(nextPaymentState("DRAFT", "approve")).toBe("APPROVED");
    expect(nextPaymentState("APPROVED", "post")).toBe("POSTED");
    expect(nextPaymentState("POSTED", "void")).toBe("VOIDED");
  });

  it("rejects skipped and terminal payment transitions", () => {
    expect(() => nextPaymentState("DRAFT", "post")).toThrow(FinanceStateError);
    expect(() => nextPaymentState("APPROVED", "approve")).toThrow(FinanceStateError);
    expect(() => nextPaymentState("VOIDED", "approve")).toThrow(FinanceStateError);
  });

  it("maps payment commands to their independently configurable actions", () => {
    expect(actionForPaymentCommand("approve")).toBe("finance.payment.approve");
    expect(actionForPaymentCommand("post")).toBe("finance.payment.post");
    expect(actionForPaymentCommand("void")).toBe("finance.payment.void");
  });
});
