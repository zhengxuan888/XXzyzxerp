import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ProductsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "product.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "product.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "product.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.product.findMany({
    where: { isActive: true, businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    include: { skus: true },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="products"
      listTitle="Products"
      detailPath="/admin/products"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "code", label: "Product Code", required: true },
        { key: "name", label: "Product Name", required: true },
        { key: "description", label: "Description" },
        { key: "category", label: "Category" },
        { key: "unit", label: "Unit" },
      ]}
      dataColumns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "category", label: "Category" },
        { key: "unit", label: "Unit" },
        { key: "description", label: "Description" },
      ]}
    />
  );
}
