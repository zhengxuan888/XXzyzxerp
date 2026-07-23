import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function LeaveRequestsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canApprove, canSubmit] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "leave_request.approve",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "leave_request.read",
      targetBusinessUnitId: membership.businessUnitId,
      targetUserId: session.userId,
    }),
  ]);

  if (!canApprove.allowed && !canSubmit.allowed) redirect("/admin");

  const rows = await prisma.leaveRequest.findMany({
    where:
      canApprove.reasons.includes("SCOPE_ALL") || canApprove.reasons.includes("SCOPE_BUSINESS_UNIT_OK")
        ? { businessUnitId: membership.businessUnitId }
        : { membershipId: membership.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="leave-requests"
      listTitle="Leave Requests"
      canCreate={canSubmit.allowed}
      canDelete={canApprove.allowed || canSubmit.allowed}
      rows={rows}
      createFields={[
        { key: "startDate", label: "Start Date (YYYY-MM-DD)", required: true },
        { key: "endDate", label: "End Date (YYYY-MM-DD)", required: true },
        { key: "reason", label: "Reason", required: true },
        { key: "rejectReason", label: "Reject Reason" },
      ]}
      dataColumns={[
        { key: "startDate", label: "Start" },
        { key: "endDate", label: "End" },
        { key: "status", label: "Status" },
        { key: "reason", label: "Reason" },
        { key: "rejectReason", label: "Reject Reason" },
      ]}
    />
  );
}
