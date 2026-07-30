import { redirect } from "next/navigation";

import FinanceSettlementWorkbench, { type FinanceWorkbenchCapabilities } from "@/components/admin/FinanceSettlementWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { getSessionFromCookie } from "@/lib/session";

export default async function FinanceSettlementsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/finance-settlements");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/finance-settlements");

  const plans = await Promise.all([
    createFinanceAccessPlan({ membership, actionKey: "finance.statement.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.counterparty.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.counterparty.manage" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement.create" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement.update" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.reconciliation.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.reconciliation.match" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.reconciliation.resolve" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.settlement.approve" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.settlement.post" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.settlement.void" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.create" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.approve" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.post" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.void" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.payment.allocate" }),
  ]);

  const [statementRead, counterpartyRead, counterpartyManage, statementCreate, statementUpdate, reconciliationRead, reconciliationMatch, reconciliationResolve, statementApprove, statementPost, statementVoid, paymentRead, paymentCreate, paymentApprove, paymentPost, paymentVoid, paymentAllocate] = plans;
  if (!statementRead.canAccessStatements) redirect("/admin");

  const capabilities: FinanceWorkbenchCapabilities = {
    canReadCounterparties: counterpartyRead.canAccessCounterparties,
    canManageCounterparties: counterpartyManage.canAccessCounterparties,
    canCreateStatements: statementCreate.canAccessStatements,
    canUpdateStatements: statementUpdate.canAccessStatements,
    canReadReconciliation: reconciliationRead.canAccessStatements,
    canMatchReconciliation: reconciliationMatch.canAccessStatements,
    canResolveReconciliation: reconciliationResolve.canAccessStatements,
    canApproveStatements: statementApprove.canAccessStatements,
    canPostStatements: statementPost.canAccessStatements,
    canVoidStatements: statementVoid.canAccessStatements,
    canReadPayments: paymentRead.canAccessPayments,
    canCreatePayments: paymentCreate.canAccessPayments,
    canApprovePayments: paymentApprove.canAccessPayments,
    canPostPayments: paymentPost.canAccessPayments,
    canVoidPayments: paymentVoid.canAccessPayments,
    canAllocatePayments: paymentAllocate.canAccessPayments,
  };

  return <FinanceSettlementWorkbench capabilities={capabilities} />;
}
