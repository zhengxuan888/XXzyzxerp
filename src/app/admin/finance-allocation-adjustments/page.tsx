import { redirect } from "next/navigation";

import FinanceAllocationAdjustmentWorkbench, { type FinanceAllocationAdjustmentCapabilities } from "@/components/admin/FinanceAllocationAdjustmentWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { getSessionFromCookie } from "@/lib/session";

function canOperate(plan: Awaited<ReturnType<typeof createFinanceAccessPlan>>) {
  return plan.canAccessPayments && plan.canAccessStatements;
}

export default async function FinanceAllocationAdjustmentsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/finance-allocation-adjustments");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/finance-allocation-adjustments");

  const [read, request, approve, apply, cancel] = await Promise.all([
    createFinanceAccessPlan({ membership, actionKey: "finance.allocation_adjustment.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.allocation_adjustment.request" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.allocation_adjustment.approve" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.allocation_adjustment.apply" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.allocation_adjustment.cancel" }),
  ]);
  if (!canOperate(read)) redirect("/admin");

  const capabilities: FinanceAllocationAdjustmentCapabilities = {
    canRead: canOperate(read),
    canRequest: canOperate(request),
    canApprove: canOperate(approve),
    canApply: canOperate(apply),
    canCancel: canOperate(cancel),
  };
  return <FinanceAllocationAdjustmentWorkbench capabilities={capabilities} />;
}
