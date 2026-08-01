import { redirect } from "next/navigation";

import MarketingWorkbench from "@/components/admin/MarketingWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function MarketingWorkbenchPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/marketing");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const canView = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "marketing.workbench.view",
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: membership.departmentId,
    targetSiteId: membership.siteId,
    targetMembershipId: membership.id,
  });
  if (!canView.allowed) redirect("/admin");
  return <MarketingWorkbench />;
}
