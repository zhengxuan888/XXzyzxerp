export const financeSegregationPolicyKeys = [
  "requireStatementApproverDifferentFromCreator",
  "requireStatementPosterDifferentFromCreator",
  "requireStatementPosterDifferentFromApprover",
  "requirePaymentApproverDifferentFromCreator",
  "requirePaymentPosterDifferentFromCreator",
  "requirePaymentPosterDifferentFromApprover",
] as const;

export type FinanceSegregationPolicyKey = (typeof financeSegregationPolicyKeys)[number];

export type FinanceSegregationPolicy = Record<FinanceSegregationPolicyKey, boolean>;

/**
 * A policy row is configuration, but finance must remain fail-closed while a
 * new business unit is being configured. No organization, department or role
 * is named here.
 */
export const strictFinanceSegregationPolicy: Readonly<FinanceSegregationPolicy> = Object.freeze({
  requireStatementApproverDifferentFromCreator: true,
  requireStatementPosterDifferentFromCreator: true,
  requireStatementPosterDifferentFromApprover: true,
  requirePaymentApproverDifferentFromCreator: true,
  requirePaymentPosterDifferentFromCreator: true,
  requirePaymentPosterDifferentFromApprover: true,
});

export class FinanceSegregationPolicyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceSegregationPolicyInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Returns a strict policy when no database row exists. */
export function resolveFinanceSegregationPolicy(raw: unknown): FinanceSegregationPolicy {
  if (!isRecord(raw)) return { ...strictFinanceSegregationPolicy };
  return financeSegregationPolicyKeys.reduce<FinanceSegregationPolicy>((result, key) => {
    result[key] = typeof raw[key] === "boolean" ? raw[key] : strictFinanceSegregationPolicy[key];
    return result;
  }, {} as FinanceSegregationPolicy);
}

/** PUT input is deliberately complete, so an accidental omitted switch cannot weaken a control. */
export function parseFinanceSegregationPolicy(raw: unknown): FinanceSegregationPolicy {
  if (!isRecord(raw)) throw new FinanceSegregationPolicyInputError("财务内控配置格式不正确。");
  return financeSegregationPolicyKeys.reduce<FinanceSegregationPolicy>((result, key) => {
    if (typeof raw[key] !== "boolean") {
      throw new FinanceSegregationPolicyInputError(`财务内控字段 ${key} 必须为布尔值。`);
    }
    result[key] = raw[key];
    return result;
  }, {} as FinanceSegregationPolicy);
}

export type FinanceSegregationCommand =
  | "statement.approve"
  | "statement.post"
  | "payment.approve"
  | "payment.post";

export type FinanceSegregationSubject = {
  createdByUserId: string;
  approvedByUserId?: string | null;
};

export type FinanceSegregationDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

function sameUser(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left === right);
}

/**
 * Evaluates only configuration and IDs. Authorization is still performed by
 * the caller through the dynamic Action + Scope + Membership engine first.
 */
export function checkFinanceSegregation({
  command,
  actorUserId,
  subject,
  policy,
}: {
  command: FinanceSegregationCommand;
  actorUserId: string;
  subject: FinanceSegregationSubject;
  policy: FinanceSegregationPolicy;
}): FinanceSegregationDecision {
  const isStatement = command.startsWith("statement.");
  const approving = command.endsWith(".approve");
  const posting = command.endsWith(".post");

  if (approving) {
    const required = isStatement
      ? policy.requireStatementApproverDifferentFromCreator
      : policy.requirePaymentApproverDifferentFromCreator;
    if (required && sameUser(actorUserId, subject.createdByUserId)) {
      return {
        allowed: false,
        code: "FINANCE_MAKER_CHECKER_REQUIRED",
        message: "当前财务内控要求制单人与审批人必须不同。",
      };
    }
  }

  if (posting) {
    const requireDifferentFromCreator = isStatement
      ? policy.requireStatementPosterDifferentFromCreator
      : policy.requirePaymentPosterDifferentFromCreator;
    if (requireDifferentFromCreator && sameUser(actorUserId, subject.createdByUserId)) {
      return {
        allowed: false,
        code: "FINANCE_MAKER_POSTER_SEPARATION_REQUIRED",
        message: "当前财务内控要求制单人与过账人必须不同。",
      };
    }

    const requireDifferentFromApprover = isStatement
      ? policy.requireStatementPosterDifferentFromApprover
      : policy.requirePaymentPosterDifferentFromApprover;
    if (requireDifferentFromApprover && !subject.approvedByUserId) {
      return {
        allowed: false,
        code: "FINANCE_APPROVER_REQUIRED",
        message: "缺少审批人记录，不能执行财务过账。",
      };
    }
    if (requireDifferentFromApprover && sameUser(actorUserId, subject.approvedByUserId)) {
      return {
        allowed: false,
        code: "FINANCE_APPROVER_POSTER_SEPARATION_REQUIRED",
        message: "当前财务内控要求审批人与过账人必须不同。",
      };
    }
  }

  return { allowed: true };
}
