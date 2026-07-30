export type FinanceStatementState = "DRAFT" | "RECONCILING" | "EXCEPTION" | "APPROVED" | "POSTED" | "VOIDED";
export type FinancePaymentState = "DRAFT" | "APPROVED" | "POSTED" | "VOIDED";

export type FinanceStatementCommand =
  | "start_reconciliation"
  | "mark_exception"
  | "resume_reconciliation"
  | "approve"
  | "post"
  | "void";

export type FinancePaymentCommand = "approve" | "post" | "void";

export class FinanceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceStateError";
  }
}

const statementTransitions: Record<FinanceStatementCommand, Partial<Record<FinanceStatementState, FinanceStatementState>>> = {
  start_reconciliation: { DRAFT: "RECONCILING" },
  mark_exception: { RECONCILING: "EXCEPTION" },
  resume_reconciliation: { EXCEPTION: "RECONCILING" },
  approve: { RECONCILING: "APPROVED" },
  post: { APPROVED: "POSTED" },
  // A posted statement is a financial fact. It must be corrected by the
  // controlled reversal workflow, never overwritten through direct voiding.
  void: { DRAFT: "VOIDED", RECONCILING: "VOIDED", EXCEPTION: "VOIDED", APPROVED: "VOIDED" },
};

const paymentTransitions: Record<FinancePaymentCommand, Partial<Record<FinancePaymentState, FinancePaymentState>>> = {
  approve: { DRAFT: "APPROVED" },
  post: { APPROVED: "POSTED" },
  // Same invariant for posted payments: no direct mutation of booked facts.
  void: { DRAFT: "VOIDED", APPROVED: "VOIDED" },
};

export function nextStatementState(current: FinanceStatementState, command: FinanceStatementCommand) {
  const next = statementTransitions[command][current];
  if (!next) throw new FinanceStateError(`结算单当前状态 ${current} 不允许执行 ${command}。`);
  return next;
}

export function nextPaymentState(current: FinancePaymentState, command: FinancePaymentCommand) {
  const next = paymentTransitions[command][current];
  if (!next) throw new FinanceStateError(`付款记录当前状态 ${current} 不允许执行 ${command}。`);
  return next;
}

export function actionForStatementCommand(command: FinanceStatementCommand) {
  if (command === "start_reconciliation" || command === "mark_exception" || command === "resume_reconciliation") {
    return "finance.reconciliation.resolve";
  }
  if (command === "approve") return "finance.settlement.approve";
  if (command === "post") return "finance.settlement.post";
  return "finance.settlement.void";
}

export function actionForPaymentCommand(command: FinancePaymentCommand) {
  if (command === "approve") return "finance.payment.approve";
  if (command === "post") return "finance.payment.post";
  return "finance.payment.void";
}
