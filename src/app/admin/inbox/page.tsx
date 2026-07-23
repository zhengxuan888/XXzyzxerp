import { redirect } from "next/navigation";
import UnifiedInbox from "@/components/admin/UnifiedInbox";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function InboxPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const decision = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "inbox.read",
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: membership.departmentId,
  });
  if (!decision.allowed) redirect("/admin");
  return <UnifiedInbox />;
}
