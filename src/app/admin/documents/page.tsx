import { redirect } from "next/navigation";

import DocumentCenterWorkbench from "@/components/admin/DocumentCenterWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createDocumentAccessPlan } from "@/lib/document-access";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function DocumentsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/documents");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/documents");

  const [readPlan, create, configure] = await Promise.all([
    createDocumentAccessPlan({ membership, actionKey: "document.read" }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "document.create",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: session.userId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "document.category.configure",
      allowedScopes: ["ALL", "BUSINESS_UNIT"],
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: session.userId,
    }),
  ]);
  if (!readPlan.allowed) redirect("/admin");

  return <DocumentCenterWorkbench capabilities={{ canCreate: create.allowed, canConfigure: configure.allowed }} />;
}
