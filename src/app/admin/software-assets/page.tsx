import { redirect } from "next/navigation";

import ResourceCenterWorkbench from "@/components/admin/ResourceCenterWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { createResourceAccessPlan } from "@/lib/resource-access";
import { getSessionFromCookie } from "@/lib/session";

export default async function SoftwareAssetsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login?returnUrl=/admin/software-assets");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login?returnUrl=/admin/software-assets");

  const access = await createResourceAccessPlan({ membership, actionKey: "resource.read" });
  if (!access.allowed) redirect("/admin");

  return <ResourceCenterWorkbench softwareOnly />;
}
