import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function DepartmentsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId, membershipId: membership.id, actionKey: "department.update", targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "department.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "department.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "department.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, businessUnits] = await Promise.all([
    prisma.department.findMany({ orderBy: { createdAt: "desc" }, include: { businessUnit: true } }),
    prisma.businessUnit.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <CrudPage
      resource="departments"
      listTitle="Departments"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定停用该部门吗？员工和历史业务数据不会被删除。"
      rows={rows}
      createFields={[
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Name", required: true },
        {
          key: "businessUnitId",
          label: "Business Unit",
          type: "select",
          required: true,
          options: businessUnits.map((unit) => ({ value: unit.id, label: unit.name })),
        },
        { key: "isActive", label: "启用", type: "checkbox" },
      ]}
      dataColumns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
        {
          key: "businessUnit",
          label: "Business Unit",
          render: (row) => ((row.businessUnit as { name?: string } | undefined)?.name ?? "-"),
        },
      ]}
    />
  );
}
