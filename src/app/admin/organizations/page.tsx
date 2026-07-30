import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function OrganizationsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId, membershipId: membership.id, actionKey: "legal_entity.read", targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "legal_entity.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "legal_entity.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "legal_entity.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);

  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.legalEntity.findMany({
    where: { id: membership.legalEntityId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      resource="legal-entities"
      listTitle="Legal entities"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定停用该公司吗？历史业务数据会保留，可通过编辑重新启用。"
      rows={rows}
      createFields={[
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Name", required: true },
        { key: "isActive", label: "启用", type: "checkbox" },
      ]}
      dataColumns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
      ]}
    />
  );
}
