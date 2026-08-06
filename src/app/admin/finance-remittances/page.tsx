import { redirect } from "next/navigation";

import FinanceRemittanceWorkbench from "@/components/admin/FinanceRemittanceWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { isRemittanceAdministrator } from "@/lib/finance/remittance-admin";
import { getSessionFromCookie } from "@/lib/session";

export default async function FinanceRemittancesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/finance-remittances");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/finance-remittances");
  if (!isRemittanceAdministrator(membership.role?.code)) redirect("/admin");
  return <FinanceRemittanceWorkbench />;
}
