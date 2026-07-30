import { redirect } from "next/navigation";

import FinanceControlPolicyWorkbench from "@/components/admin/FinanceControlPolicyWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { resolveFinanceSegregationPolicy } from "@/lib/finance/segregation-policy";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

const policySelect = {
  id: true,
  version: true,
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

export default async function FinanceControlsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/finance-controls");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/finance-controls");

  const permissionContext = {
    userId: session.userId,
    membershipId: membership.id,
    targetBusinessUnitId: membership.businessUnitId,
    allowedScopes: ["ALL", "BUSINESS_UNIT"] as const,
  };
  const [canRead, canManage, row] = await Promise.all([
    checkPermission({ ...permissionContext, actionKey: "finance.control_policy.read" }),
    checkPermission({ ...permissionContext, actionKey: "finance.control_policy.manage" }),
    prisma.financeControlPolicy.findUnique({ where: { businessUnitId: membership.businessUnitId }, select: policySelect }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  return <FinanceControlPolicyWorkbench
    canManage={canManage.allowed}
    initial={{
      ...resolveFinanceSegregationPolicy(row),
      configured: Boolean(row),
      version: row?.version ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }}
  />;
}
