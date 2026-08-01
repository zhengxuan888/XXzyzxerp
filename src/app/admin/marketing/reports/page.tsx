import { redirect } from "next/navigation";

import MarketingReportsWorkbench from "@/components/admin/MarketingReportsWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function MarketingReportsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/marketing/reports");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [readPlan, reviewPlan, canCreate, canUpdate, canSubmit] = await Promise.all([
    createMarketingReportAccessPlan({ membership }),
    createMarketingReportAccessPlan({ membership, actionKey: "marketing.report.review" }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "marketing.report.create", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "marketing.report.update", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "marketing.report.submit", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
  ]);
  if (!readPlan.allowed) redirect("/admin");
  return <MarketingReportsWorkbench canCreate={canCreate.allowed} canUpdate={canUpdate.allowed} canSubmit={canSubmit.allowed} canReview={reviewPlan.allowed} />;
}
