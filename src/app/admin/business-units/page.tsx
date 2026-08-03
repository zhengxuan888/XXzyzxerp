import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function BusinessUnitsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId, membershipId: membership.id, actionKey: "business_unit.read", targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "business_unit.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "business_unit.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "business_unit.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, legalEntities] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { id: membership.businessUnitId },
      orderBy: { createdAt: "desc" },
      include: { legalEntity: true },
    }),
    prisma.legalEntity.findMany({
      where: { id: membership.legalEntityId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <CrudPage
      resource="business-units"
      listTitle="业务板块"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定停用该业务板块吗？历史业务数据会保留，可通过编辑重新启用。"
      rows={rows}
      createFields={[
        { key: "code", label: "编号", required: true },
        { key: "name", label: "名称", required: true },
        {
          key: "legalEntityId",
          label: "法人主体",
          type: "select",
          required: true,
          options: legalEntities.map((legal) => ({ value: legal.id, label: legal.name })),
        },
        { key: "isActive", label: "启用", type: "checkbox" },
      ]}
      dataColumns={[
        { key: "code", label: "编号" },
        { key: "name", label: "名称" },
        { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
        {
          key: "legalEntity",
          label: "法人主体",
          render: (row) => ((row.legalEntity as { name?: string } | undefined)?.name ?? "-"),
        },
      ]}
    />
  );
}
