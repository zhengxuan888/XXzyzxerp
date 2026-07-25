import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function CustomersPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "customer.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "customer.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "customer.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);

  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.customer.findMany({
    where: { businessUnitId: membership.businessUnitId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { legalEntity: { select: { code: true, name: true } } },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="customers"
      listTitle="客户档案"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "code", label: "客户编号", required: true },
        { key: "name", label: "客户名称", required: true },
        { key: "contactName", label: "联系人" },
        { key: "contactPhone", label: "联系电话" },
        { key: "contactEmail", label: "邮箱", type: "email" },
        { key: "taxId", label: "税号" },
        { key: "address", label: "地址" },
      ]}
      dataColumns={[
        { key: "code", label: "客户编号" },
        { key: "name", label: "客户名称" },
        {
          key: "legalEntity",
          label: "所属公司",
          render: (row) => {
            const legalEntity = row.legalEntity as { code?: string; name?: string } | undefined;
            if (!legalEntity) return "-";
            return `${legalEntity.code ?? ""} ${legalEntity.name ?? ""}`.trim();
          },
        },
        { key: "contactPhone", label: "联系电话" },
        { key: "contactEmail", label: "邮箱" },
      ]}
    />
  );
}
