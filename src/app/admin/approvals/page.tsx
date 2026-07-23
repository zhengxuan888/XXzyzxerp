import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ApprovalsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "approval.submit",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "approval.submit",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "approval.review",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.approvalRecord.findMany({
    where: { businessUnitId: membership.businessUnitId },
    include: {
      submittedBy: { select: { userId: true, user: { select: { username: true, fullName: true } } } },
      approver: { select: { userId: true, user: { select: { username: true, fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="approvals"
      listTitle="Approvals"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "targetType", label: "Target Type", required: true },
        { key: "targetId", label: "Target ID", required: true },
        { key: "action", label: "Action", required: true },
        { key: "reason", label: "Reason" },
      ]}
      dataColumns={[
        { key: "targetType", label: "Target Type" },
        { key: "targetId", label: "Target ID" },
        { key: "action", label: "Action" },
        { key: "status", label: "Status" },
        {
          key: "submittedBy",
          label: "Submitted By",
          render: (row) => {
            const submittedBy = row.submittedBy as { userId?: string } | undefined;
            return submittedBy?.userId || "Unknown";
          },
        },
      ]}
    />
  );
}
