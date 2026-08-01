import { redirect } from "next/navigation";

import MarketingCreativesWorkbench from "@/components/admin/MarketingCreativesWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createMarketingCreativeAccessPlan } from "@/lib/marketing-access";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function MarketingCreativesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/marketing/creatives");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [readPlan, updatePlan, archivePlan, canCreate, canUpload, canDelete] = await Promise.all([
    createMarketingCreativeAccessPlan({ membership }),
    createMarketingCreativeAccessPlan({ membership, actionKey: "marketing.creative.update" }),
    createMarketingCreativeAccessPlan({ membership, actionKey: "marketing.creative.archive" }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "marketing.creative.create", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "attachment.create", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "attachment.delete", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId, targetSiteId: membership.siteId, targetMembershipId: membership.id }),
  ]);
  if (!readPlan.allowed) redirect("/admin");
  return <MarketingCreativesWorkbench canCreate={canCreate.allowed} canUpdate={updatePlan.allowed} canArchive={archivePlan.allowed} canUpload={canUpload.allowed} canDeleteAttachment={canDelete.allowed} />;
}
