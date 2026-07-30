import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import CustomerImportPanel from "@/components/admin/CustomerImportPanel";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function CustomersPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = (actionKey: string) => checkPermission({
    userId: session.userId, membershipId: membership.id, actionKey,
    targetBusinessUnitId: membership.businessUnitId,
  });
  const [canRead, canCreate, canDelete, canImport] = await Promise.all([
    permission("customer.read"), permission("customer.create"), permission("customer.delete"), permission("customer.import"),
  ]);
  if (!canRead.allowed) redirect("/admin");
  const rows = await prisma.customer.findMany({
    where: { businessUnitId: membership.businessUnitId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { legalEntity: { select: { code: true, name: true } } },
  });
  return (
    <>
      {canImport.allowed && <CustomerImportPanel />}
      <CrudPage
        apiBase="/api/mvp" resource="customers" listTitle="客户档案"
        canCreate={canCreate.allowed} canDelete={canDelete.allowed} rows={rows}
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
          { key: "legalEntity", label: "所属公司", render: (row) => {
            const entity = row.legalEntity as { code?: string; name?: string } | undefined;
            return entity ? `${entity.code ?? ""} ${entity.name ?? ""}`.trim() : "-";
          } },
          { key: "contactPhone", label: "联系电话" },
          { key: "contactEmail", label: "邮箱" },
        ]}
      />
    </>
  );
}
