import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AttachmentPanel from "@/components/admin/AttachmentPanel";
import ProductSkuManager from "@/components/admin/ProductSkuManager";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const { id } = await params;
  const [productRead, attachmentRead, upload, remove, skuCreate, skuUpdate] = await Promise.all(
    ["product.read", "attachment.read", "attachment.create", "attachment.delete", "sku.create", "sku.update"].map((actionKey) =>
      checkPermission({
        userId: session.userId,
        membershipId: membership.id,
        actionKey,
        targetBusinessUnitId: membership.businessUnitId,
        targetDepartmentId: membership.departmentId,
      }),
    ),
  );
  const product = await prisma.product.findFirst({
    where: { id, businessUnitId: membership.businessUnitId, isActive: true },
    include: { skus: true },
  });
  if (!product || !productRead.allowed) notFound();
  return (
    <main className="space-y-5">
      <Link href="/admin/products" className="text-sm font-semibold text-violet-700">← 返回商品管理</Link>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Product asset</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">{product.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{product.code} · {product.category ?? "未分类"} · {product.skus.length} 个 SKU</p>
      </header>
      <ProductSkuManager productId={product.id} skus={product.skus.map((sku) => ({ id: sku.id, code: sku.code, barcode: sku.barcode, isActive: sku.isActive }))} canCreate={skuCreate.allowed} canUpdate={skuUpdate.allowed} />
      {attachmentRead.allowed && <AttachmentPanel targetType="PRODUCT" targetId={product.id} canUpload={upload.allowed} canDelete={remove.allowed} title="商品图片与资料" />}
    </main>
  );
}
