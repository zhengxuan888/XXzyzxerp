import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function AttendancePage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canReadAll, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attendance.approve",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attendance.create",
      targetBusinessUnitId: membership.businessUnitId,
      targetUserId: session.userId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attendance.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);

  if (!canReadAll.allowed && !canCreate.allowed) redirect("/admin");

  const canReadScopeAll = canReadAll.reasons.includes("SCOPE_ALL") || canReadAll.reasons.includes("SCOPE_BUSINESS_UNIT_OK");

  const rows = await prisma.attendance.findMany({
    where: canReadScopeAll ? { businessUnitId: membership.businessUnitId } : { userId: session.userId },
    include: { user: { select: { username: true } }, membership: { select: { roleId: true } } },
    orderBy: { attendanceDate: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="attendance"
      listTitle="考勤管理"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "attendanceDate", label: "日期（年-月-日）", required: true },
        {
          key: "recordType",
          label: "类型",
          required: true,
          type: "select",
          options: [
            { value: "CHECK_IN", label: "签到" },
            { value: "CHECK_OUT", label: "签退" },
          ],
        },
        { key: "locationCode", label: "地点编码" },
        { key: "memo", label: "备注" },
      ]}
      dataColumns={[
        { key: "attendanceDate", label: "日期" },
        { key: "recordType", label: "类型" },
        {
          key: "user",
          label: "员工账号",
          render: (row) => {
            const user = row.user as { username?: string } | undefined;
            return user?.username || "-";
          },
        },
        { key: "locationCode", label: "地点" },
        { key: "memo", label: "备注" },
      ]}
    />
  );
}
