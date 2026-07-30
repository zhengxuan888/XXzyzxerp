import { redirect } from "next/navigation";

import FinanceStatementImportWorkbench, { type FinanceStatementImportCapabilities } from "@/components/admin/FinanceStatementImportWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { getSessionFromCookie } from "@/lib/session";

export default async function FinanceImportsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/finance-imports");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/finance-imports");

  const plans = await Promise.all([
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_template.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_template.manage" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_import.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_import.preview" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_import.confirm" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.statement_artifact.read" }),
    createFinanceAccessPlan({ membership, actionKey: "finance.counterparty.read" }),
  ]);
  const [templateRead, templateManage, importRead, importPreview, importConfirm, artifactRead, counterpartyRead] = plans;
  if (!importRead.canAccessStatementImports) redirect("/admin");

  const capabilities: FinanceStatementImportCapabilities = {
    canReadTemplates: templateRead.canAccessImportTemplates,
    canManageTemplates: templateManage.canAccessImportTemplates,
    canReadImports: importRead.canAccessStatementImports,
    canPreviewImports: importPreview.canAccessStatementImports,
    canConfirmImports: importConfirm.canAccessStatementImports,
    canReadArtifacts: artifactRead.canAccessStatementImports,
    canReadCounterparties: counterpartyRead.canAccessCounterparties,
  };
  return <FinanceStatementImportWorkbench capabilities={capabilities} />;
}
