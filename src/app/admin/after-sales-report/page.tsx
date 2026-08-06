import { redirect } from "next/navigation";

import AfterSalesDailyReport from "@/components/admin/AfterSalesDailyReport";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function AfterSalesReportPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");

  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const access = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!access.allowed) redirect("/admin");

  return <AfterSalesDailyReport />;
}
