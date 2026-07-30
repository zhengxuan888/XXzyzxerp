import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  FinanceSegregationPolicyInputError,
  parseFinanceSegregationPolicy,
  resolveFinanceSegregationPolicy,
} from "@/lib/finance/segregation-policy";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const policySelect = {
  id: true,
  updatedByMembershipId: true,
  createdAt: true,
  updatedAt: true,
  requireStatementApproverDifferentFromCreator: true,
  requireStatementPosterDifferentFromCreator: true,
  requireStatementPosterDifferentFromApprover: true,
  requirePaymentApproverDifferentFromCreator: true,
  requirePaymentPosterDifferentFromCreator: true,
  requirePaymentPosterDifferentFromApprover: true,
} as const;

type FinanceControlPolicyRow = {
  id: string;
  updatedByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  requireStatementApproverDifferentFromCreator: boolean;
  requireStatementPosterDifferentFromCreator: boolean;
  requireStatementPosterDifferentFromApprover: boolean;
  requirePaymentApproverDifferentFromCreator: boolean;
  requirePaymentPosterDifferentFromCreator: boolean;
  requirePaymentPosterDifferentFromApprover: boolean;
};

function policyDto(row: FinanceControlPolicyRow | null) {
  const config = resolveFinanceSegregationPolicy(row);
  return {
    ...config,
    configured: Boolean(row),
    id: row?.id ?? null,
    updatedByMembershipId: row?.updatedByMembershipId ?? null,
    createdAt: row?.createdAt.toISOString() ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
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
    const config = parseFinanceSegregationPolicy(await request.json().catch(() => null));
    const before = await prisma.financeControlPolicy.findUnique({
      where: { businessUnitId: access.auth.membership.businessUnitId },
      select: policySelect,
    });
    const policy = await prisma.financeControlPolicy.upsert({
      where: { businessUnitId: access.auth.membership.businessUnitId },
      update: { ...config, updatedByMembershipId: access.auth.membership.id },
      create: {
        legalEntityId: access.auth.membership.legalEntityId,
        businessUnitId: access.auth.membership.businessUnitId,
        updatedByMembershipId: access.auth.membership.id,
        ...config,
      },
      select: policySelect,
    });
    await writeAuditLog({
      actorUserId: access.auth.userId,
      actorMembershipId: access.auth.membership.id,
      legalEntityId: access.auth.membership.legalEntityId,
      businessUnitId: access.auth.membership.businessUnitId,
      roleId: access.auth.membership.roleId,
      module: "finance.control_policy",
      action: "finance.control_policy.manage",
      targetType: "finance_control_policy",
      targetId: policy.id,
      details: {
        before: resolveFinanceSegregationPolicy(before),
        after: config,
      },
    });
    return ok(policyDto(policy));
  } catch (error) {
    if (error instanceof FinanceSegregationPolicyInputError) {
      return fail("INVALID_FINANCE_CONTROL_POLICY", error.message, 400);
    }
    throw error;
  }
}
