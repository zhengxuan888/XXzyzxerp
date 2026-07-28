import { redirect } from "next/navigation";

import StatisticsWorkbench from "@/components/admin/StatisticsWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function StatisticsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const decision = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "report.view",
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: membership.departmentId,
    targetSiteId: membership.siteId,
    targetUserId: session.userId,
  });
  if (!decision.allowed) redirect("/admin");
  return <StatisticsWorkbench />;
}
