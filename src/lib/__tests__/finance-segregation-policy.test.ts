import { describe, expect, it } from "vitest";

import {
  checkFinanceSegregation,
  FinanceSegregationPolicyInputError,
  parseFinanceSegregationPolicy,
  parseFinanceSegregationPolicyChange,
  resolveFinanceSegregationPolicy,
  strictFinanceSegregationPolicy,
} from "../finance/segregation-policy";

const maker = { createdByUserId: "user-maker", approvedByUserId: "user-approver" };

describe("finance segregation of duties policy", () => {
  it("fails closed with the strict default when a business unit has no saved policy", () => {
    const policy = resolveFinanceSegregationPolicy(null);
    expect(policy).toEqual(strictFinanceSegregationPolicy);

    expect(checkFinanceSegregation({
      command: "statement.approve",
      actorUserId: "user-maker",
      subject: maker,
      policy,
    })).toMatchObject({ allowed: false, code: "FINANCE_MAKER_CHECKER_REQUIRED" });
  });

  it("compares employee identity rather than membership identity, preventing context-switch bypass", () => {
    const policy = resolveFinanceSegregationPolicy(null);

    const decision = checkFinanceSegregation({
      command: "payment.approve",
      // This is the same employee using another Membership/context. Membership
      // IDs are not accepted by the policy evaluator, by design.
      actorUserId: "user-maker",
      subject: { createdByUserId: "user-maker" },
      policy,
    });

    expect(decision).toMatchObject({ allowed: false, code: "FINANCE_MAKER_CHECKER_REQUIRED" });
  });

  it("requires a third employee to post statements and payments under the strict policy", () => {
    const policy = resolveFinanceSegregationPolicy(null);

    expect(checkFinanceSegregation({
      command: "statement.post",
      actorUserId: "user-maker",
      subject: maker,
      policy,
    })).toMatchObject({ allowed: false, code: "FINANCE_MAKER_POSTER_SEPARATION_REQUIRED" });
    expect(checkFinanceSegregation({
      command: "statement.post",
      actorUserId: "user-approver",
      subject: maker,
      policy,
    })).toMatchObject({ allowed: false, code: "FINANCE_APPROVER_POSTER_SEPARATION_REQUIRED" });
    expect(checkFinanceSegregation({
      command: "payment.post",
      actorUserId: "user-poster",
      subject: maker,
      policy,
    })).toEqual({ allowed: true });
  });

  it("requires an approval actor before a strict post and only relaxes a check when its explicit configuration switch is off", () => {
    const strict = resolveFinanceSegregationPolicy(null);
    expect(checkFinanceSegregation({
      command: "payment.post",
      actorUserId: "user-poster",
      subject: { createdByUserId: "user-maker", approvedByUserId: null },
      policy: strict,
    })).toMatchObject({ allowed: false, code: "FINANCE_APPROVER_REQUIRED" });

    const relaxed = { ...strict, requirePaymentApproverDifferentFromCreator: false };
    expect(checkFinanceSegregation({
      command: "payment.approve",
      actorUserId: "user-maker",
      subject: { createdByUserId: "user-maker" },
      policy: relaxed,
    })).toEqual({ allowed: true });
  });

  it("accepts only complete boolean policy payloads", () => {
    expect(() => parseFinanceSegregationPolicy({
      requireStatementApproverDifferentFromCreator: true,
    })).toThrow(FinanceSegregationPolicyInputError);

    expect(parseFinanceSegregationPolicy({ ...strictFinanceSegregationPolicy })).toEqual(strictFinanceSegregationPolicy);
  });

  it("requires an optimistic version and a human reason for policy changes", () => {
    const base = { ...strictFinanceSegregationPolicy };

    expect(() => parseFinanceSegregationPolicyChange(base)).toThrow(FinanceSegregationPolicyInputError);
    expect(() => parseFinanceSegregationPolicyChange({ ...base, expectedVersion: 1, reason: "  " })).toThrow(FinanceSegregationPolicyInputError);
    expect(() => parseFinanceSegregationPolicyChange({ ...base, expectedVersion: 0, reason: "岗位调整" })).toThrow(FinanceSegregationPolicyInputError);
    expect(parseFinanceSegregationPolicyChange({ ...base, expectedVersion: 4, reason: "岗位调整" })).toEqual({
      policy: base,
      expectedVersion: 4,
      reason: "岗位调整",
    });
  });
});
