import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  FinanceSegregationPolicyInputError,
  parseFinanceSegregationPolicyChange,
  resolveFinanceSegregationPolicy,
} from "@/lib/finance/segregation-policy";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const policySelect = {
  id: true,
  version: true,
  updatedByMembershipId: true,
  createdAt: true,
  updatedAt: true,
  requireStatementApproverDifferentFromCreator: true,
  requireStatementPosterDifferentFromCreator: true,
  requireStatementPosterDifferentFromApprover: true,
  requirePaymentApproverDifferentFromCreator: true,
  requirePaymentPosterDifferentFromCreator: true,
  requirePaymentPosterDifferentFromApprover: true,
  requireReconciliationResolverDifferentFromCreator: true,
  requirePaymentAllocatorDifferentFromCreator: true,
  requirePaymentAllocatorDifferentFromApprover: true,
} as const;

type FinanceControlPolicyRow = {
  id: string;
  version: number;
  updatedByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  requireStatementApproverDifferentFromCreator: boolean;
  requireStatementPosterDifferentFromCreator: boolean;
  requireStatementPosterDifferentFromApprover: boolean;
  requirePaymentApproverDifferentFromCreator: boolean;
  requirePaymentPosterDifferentFromCreator: boolean;
  requirePaymentPosterDifferentFromApprover: boolean;
  requireReconciliationResolverDifferentFromCreator: boolean;
  requirePaymentAllocatorDifferentFromCreator: boolean;
  requirePaymentAllocatorDifferentFromApprover: boolean;
};

function policyDto(row: FinanceControlPolicyRow | null) {
  const config = resolveFinanceSegregationPolicy(row);
  return {
    ...config,
    configured: Boolean(row),
    id: row?.id ?? null,
    version: row?.version ?? null,
    updatedByMembershipId: row?.updatedByMembershipId ?? null,
    createdAt: row?.createdAt.toISOString() ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

class FinanceControlPolicyConflictError extends Error {
  constructor() {
    super("财务内控规则刚刚被其他人更新，请刷新后再保存。");
    this.name = "FinanceControlPolicyConflictError";
  }
}

async function requireBusinessUnitControlAction(request: NextRequest, actionKey: string) {
  const auth = await requireAuthContext(request);
  if (!auth) return { auth: null, error: fail("UNAUTHENTICATED", "请先登录。", 401) };
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
    allowedScopes: ["ALL", "BUSINESS_UNIT"],
  });
  if (!permission.allowed) return { auth: null, error: fail("FORBIDDEN", "无权访问当前业务板块的财务内控规则。", 403) };
  return { auth, error: null };
}

export async function GET(request: NextRequest) {
  const access = await requireBusinessUnitControlAction(request, "finance.control_policy.read");
  if (access.error) return access.error;
  const policy = await prisma.financeControlPolicy.findUnique({
    where: { businessUnitId: access.auth.membership.businessUnitId },
    select: policySelect,
  });
  return ok(policyDto(policy));
}

export async function PUT(request: NextRequest) {
  const access = await requireBusinessUnitControlAction(request, "finance.control_policy.manage");
  if (access.error) return access.error;

  try {
    const input = parseFinanceSegregationPolicyChange(await request.json().catch(() => null));
    const policy = await prisma.$transaction(async (tx) => {
      const before = await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: access.auth.membership.businessUnitId },
        select: policySelect,
      });

      let next: FinanceControlPolicyRow;
      if (before) {
        if (input.expectedVersion !== before.version) throw new FinanceControlPolicyConflictError();
        const updated = await tx.financeControlPolicy.updateMany({
          where: { id: before.id, version: before.version },
          data: {
            ...input.policy,
            updatedByMembershipId: access.auth.membership.id,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new FinanceControlPolicyConflictError();
        next = await tx.financeControlPolicy.findUniqueOrThrow({
          where: { id: before.id },
          select: policySelect,
        });
      } else {
        if (input.expectedVersion !== null) throw new FinanceControlPolicyConflictError();
        next = await tx.financeControlPolicy.create({
          data: {
            legalEntityId: access.auth.membership.legalEntityId,
            businessUnitId: access.auth.membership.businessUnitId,
            updatedByMembershipId: access.auth.membership.id,
            ...input.policy,
          },
          select: policySelect,
        });
      }

      // The policy fact, its version and audit event commit together. If audit
      // persistence fails, PostgreSQL rolls this policy change back as well.
      await writeAuditLog({
        actorUserId: access.auth.userId,
        actorMembershipId: access.auth.membership.id,
        legalEntityId: access.auth.membership.legalEntityId,
        businessUnitId: access.auth.membership.businessUnitId,
        roleId: access.auth.membership.roleId,
        module: "finance.control_policy",
        action: "finance.control_policy.manage",
        targetType: "finance_control_policy",
        targetId: next.id,
        details: {
          reason: input.reason,
          versionBefore: before?.version ?? null,
          versionAfter: next.version,
          before: before ? resolveFinanceSegregationPolicy(before) : null,
          after: input.policy,
        },
      }, tx);
      return next;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return ok(policyDto(policy));
  } catch (error) {
    if (error instanceof FinanceSegregationPolicyInputError) {
      return fail("INVALID_FINANCE_CONTROL_POLICY", error.message, 400);
    }
    if (error instanceof FinanceControlPolicyConflictError) {
      return fail("FINANCE_CONTROL_POLICY_STALE", error.message, 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      return fail("FINANCE_CONTROL_POLICY_STALE", "财务内控规则刚刚被其他人更新，请刷新后再保存。", 409);
    }
    throw error;
  }
}
