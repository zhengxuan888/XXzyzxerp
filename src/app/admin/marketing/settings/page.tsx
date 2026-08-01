import { redirect } from "next/navigation";

import MarketingSettingsWorkbench from "@/components/admin/MarketingSettingsWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function MarketingSettingsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/marketing/settings");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const canConfigure = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "marketing.workbench.configure",
    targetBusinessUnitId: membership.businessUnitId,
    allowedScopes: ["ALL", "BUSINESS_UNIT"],
  });
  if (!canConfigure.allowed) redirect("/admin");
  return <MarketingSettingsWorkbench />;
}
