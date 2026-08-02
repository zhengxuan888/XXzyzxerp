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
      listTitle="请假申请"
      canCreate={canSubmit.allowed}
      canDelete={canApprove.allowed || canSubmit.allowed}
      rows={rows}
      createFields={[
        { key: "startDate", label: "开始日期（YYYY-MM-DD）", required: true },
        { key: "endDate", label: "结束日期（YYYY-MM-DD）", required: true },
        { key: "reason", label: "请假原因", required: true },
        { key: "rejectReason", label: "驳回原因" },
      ]}
      dataColumns={[
        { key: "startDate", label: "开始日期" },
        { key: "endDate", label: "结束日期" },
        { key: "status", label: "状态" },
        { key: "reason", label: "请假原因" },
        { key: "rejectReason", label: "驳回原因" },
      ]}
    />
  );
}
