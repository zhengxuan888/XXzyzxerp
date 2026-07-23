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
      listTitle="Customers"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "code", label: "Customer Code", required: true },
        { key: "name", label: "Customer Name", required: true },
        { key: "contactName", label: "Contact Name" },
        { key: "contactPhone", label: "Phone" },
        { key: "contactEmail", label: "Email", type: "email" },
        { key: "taxId", label: "Tax ID" },
        { key: "address", label: "Address" },
      ]}
      dataColumns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        {
          key: "legalEntity",
          label: "Legal Entity",
          render: (row) => {
            const legalEntity = row.legalEntity as { code?: string; name?: string } | undefined;
            if (!legalEntity) return "-";
            return `${legalEntity.code ?? ""} ${legalEntity.name ?? ""}`.trim();
          },
        },
        { key: "contactPhone", label: "Phone" },
        { key: "contactEmail", label: "Email" },
      ]}
    />
  );
}
