import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import EmployeeImportPanel from "@/components/admin/EmployeeImportPanel";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function UsersPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = (actionKey: string) => checkPermission({
    userId: session.userId, membershipId: membership.id, actionKey,
    targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId,
  });
  const [canRead, canCreate, canUpdate, canDelete, canImport] = await Promise.all([
    permission("user.read"), permission("user.create"), permission("user.update"),
    permission("user.delete"), permission("user.import"),
  ]);
  if (!canRead.allowed) redirect("/admin");
  const rows = await prisma.user.findMany({
    where: canRead.reasons.includes("SCOPE_ALL")
      ? {}
      : { memberships: { some: { businessUnitId: membership.businessUnitId } } },
    orderBy: { createdAt: "desc" },
    include: { memberships: { include: { businessUnit: true, role: true, department: true } } },
  });
  return (
    <>
      {canImport.allowed && <EmployeeImportPanel />}
      <CrudPage
        resource="users" listTitle="员工账号"
        canCreate={canCreate.allowed} canUpdate={canUpdate.allowed} canDelete={canDelete.allowed}
        deleteConfirmation="确定停用该员工账号吗？历史订单、考勤和审计记录不会删除。"
        rows={rows}
        createFields={[
          { key: "username", label: "员工账号", required: true },
          { key: "email", label: "邮箱", type: "email", required: true },
          { key: "fullName", label: "姓名", required: true },
          { key: "password", label: "初始密码", type: "password" },
          { key: "isActive", label: "启用账号", type: "checkbox" },
        ]}
        dataColumns={[
          { key: "username", label: "员工账号" },
          { key: "email", label: "邮箱" },
          { key: "fullName", label: "姓名" },
          { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "待激活/停用" },
        ]}
      />
    </>
  );
}
