import { redirect } from "next/navigation";

import MarketingKpisWorkbench from "@/components/admin/MarketingKpisWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function MarketingKpisPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/marketing/kpis");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [readPlan, canManage] = await Promise.all([
    createMarketingReportAccessPlan({ membership, actionKey: "marketing.kpi.read" }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "marketing.kpi.manage", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
  ]);
  if (!readPlan.allowed) redirect("/admin");
  return <MarketingKpisWorkbench canManage={canManage.allowed} />;
}
