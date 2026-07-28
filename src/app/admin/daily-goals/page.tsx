import { redirect } from "next/navigation";

import DailyGoalsWorkbench from "@/components/admin/DailyGoalsWorkbench";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function DailyGoalsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const canRead = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "daily_goal.read",
    targetBusinessUnitId: membership.businessUnitId,
    targetUserId: session.userId,
  });
  if (!canRead.allowed) redirect("/admin");
  return <DailyGoalsWorkbench />;
}
