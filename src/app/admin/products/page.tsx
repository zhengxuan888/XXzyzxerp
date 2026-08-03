import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import ProductImportPanel from "@/components/admin/ProductImportPanel";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

function productSpecificationSummary(skus: Array<{ attributes: unknown }>) {
  const colors = new Set<string>();
  const capacities = new Set<string>();
  for (const sku of skus) {
    if (!sku.attributes || typeof sku.attributes !== "object" || Array.isArray(sku.attributes)) continue;
    const attributes = sku.attributes as Record<string, unknown>;
    if (typeof attributes.color === "string" && attributes.color) colors.add(attributes.color);
    if (typeof attributes.capacity === "string" && attributes.capacity) capacities.add(attributes.capacity);
  }
  if (!colors.size && !capacities.size) return "未配置颜色/容量";
  return `${colors.size}色 × ${capacities.size}容量｜${Array.from(colors).join("、")}｜${Array.from(capacities).join("、")}`;
}

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
  const [canRead, canCreate, canUpdate, canDelete, canImport, canExport] = await Promise.all([
    permission("product.read"),
    permission("product.create"),
    permission("product.update"),
    permission("product.delete"),
    permission("product.import"),
    permission("product.export"),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const products = await prisma.product.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    include: { skus: true },
  });
  const images = await prisma.attachment.findMany({
    where: {
      businessUnitId: membership.businessUnitId,
      targetType: "PRODUCT",
      targetId: { in: products.map((product) => product.id) },
      status: "ACTIVE",
      mimeType: { startsWith: "image/" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, targetId: true },
  });
  const imageByProductId = new Map<string, string>();
  for (const image of images) {
    if (!imageByProductId.has(image.targetId)) imageByProductId.set(image.targetId, `/api/mvp/attachments/${image.id}/content`);
  }
  const rows = products.map((product) => ({ ...product, imageUrl: imageByProductId.get(product.id) ?? "" }));

  return (
    <>
      {canImport.allowed && <ProductImportPanel canExport={canExport.allowed} />}
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
          { key: "imageUrl", label: "图片", type: "image" },
          { key: "code", label: "商品编码" },
          { key: "name", label: "商品名称" },
          { key: "skuCount", label: "规格数量", render: (row) => `${(row.skus as unknown[]).length} 个 SKU` },
          { key: "specifications", label: "型号与配比", render: (row) => productSpecificationSummary(row.skus as Array<{ attributes: unknown }>) },
          { key: "category", label: "分类" },
          { key: "unit", label: "单位" },
          { key: "description", label: "描述" },
          { key: "isActive", label: "状态", render: (row) => row.isActive ? "启用" : "停用" },
        ]}
      />
    </>
  );
}
