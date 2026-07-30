import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import ProductImportPanel from "@/components/admin/ProductImportPanel";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function ProductsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const permission = (actionKey: string) => checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey,
    targetBusinessUnitId: membership.businessUnitId,
  });
  const [canRead, canCreate, canUpdate, canDelete, canImport] = await Promise.all([
    permission("product.read"),
    permission("product.create"),
    permission("product.update"),
    permission("product.delete"),
    permission("product.import"),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.product.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    include: { skus: true },
  });

  return (
    <>
      {canImport.allowed && <ProductImportPanel />}
      <CrudPage
        apiBase="/api/mvp"
        resource="products"
        listTitle="商品与 SKU"
        detailPath="/admin/products"
        canCreate={canCreate.allowed}
        canUpdate={canUpdate.allowed}
        canDelete={canDelete.allowed}
        deleteConfirmation="确定停用该商品吗？历史订单、库存和物流记录不会删除。"
        rows={rows}
        createFields={[
          { key: "code", label: "商品编码", required: true },
          { key: "name", label: "商品名称", required: true },
          { key: "description", label: "商品描述" },
          { key: "category", label: "分类" },
          { key: "unit", label: "单位" },
          { key: "isActive", label: "启用商品", type: "checkbox" },
        ]}
        dataColumns={[
          { key: "code", label: "商品编码" },
          { key: "name", label: "商品名称" },
          { key: "category", label: "分类" },
          { key: "unit", label: "单位" },
          { key: "description", label: "描述" },
          { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
        ]}
      />
    </>
  );
}
