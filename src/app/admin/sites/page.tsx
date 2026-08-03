import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function SitesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId, membershipId: membership.id, actionKey: "site.read", targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, businessUnits, departments] = await Promise.all([
    prisma.site.findMany({
      where: { businessUnitId: membership.businessUnitId },
      orderBy: { createdAt: "desc" },
      include: { businessUnit: true, department: true },
    }),
    prisma.businessUnit.findMany({
      where: { id: membership.businessUnitId },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { businessUnitId: membership.businessUnitId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <CrudPage
      resource="sites"
      listTitle="站点管理"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定停用该站点吗？库存、订单和物流历史不会被删除。"
      rows={rows}
      createFields={[
        { key: "code", label: "编号", required: true },
        { key: "name", label: "名称", required: true },
        {
          key: "businessUnitId",
          label: "业务板块",
          type: "select",
          required: true,
          options: businessUnits.map((unit) => ({ value: unit.id, label: unit.name })),
        },
        { key: "isActive", label: "启用", type: "checkbox" },
        {
          key: "departmentId",
          label: "部门（可选）",
          type: "select",
          options: departments.map((dept) => ({ value: dept.id, label: `${dept.code} - ${dept.name}` })),
        },
      ]}
      dataColumns={[
        { key: "code", label: "编号" },
        { key: "name", label: "名称" },
        { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
        {
          key: "businessUnit",
          label: "业务板块",
          render: (row) => ((row.businessUnit as { name?: string } | undefined)?.name ?? "-"),
        },
        {
          key: "department",
          label: "部门",
          render: (row) => ((row.department as { name?: string } | undefined)?.name ?? "-"),
        },
      ]}
    />
  );
}
