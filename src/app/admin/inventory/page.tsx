import { redirect } from "next/navigation";

import InventoryAdjustmentForm from "@/components/admin/InventoryAdjustmentForm";
import { getSession } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canAdjust] = await Promise.all([
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "inventory.read", targetBusinessUnitId: membership.businessUnitId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "inventory.adjust", targetBusinessUnitId: membership.businessUnitId, targetSiteId: membership.siteId }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [balances, sites, skus] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { businessUnitId: membership.businessUnitId },
      include: { site: true, sku: { include: { product: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.site.findMany({ where: { businessUnitId: membership.businessUnitId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    prisma.productSku.findMany({
      where: { isActive: true, product: { businessUnitId: membership.businessUnitId, isActive: true } },
      include: { product: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-950">库存管理</h1>
        <p className="mt-1 text-sm text-gray-500">可用库存与订单预留分开记录；任何扣减都不允许产生负库存。</p>
      </div>
      <InventoryAdjustmentForm
        canAdjust={canAdjust.allowed}
        sites={sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))}
        skus={skus.map((sku) => ({ id: sku.id, label: `${sku.product.code}/${sku.code} · ${sku.product.name}` }))}
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b bg-gray-50 text-left text-gray-500"><th className="px-4 py-3">商品/SKU</th><th className="px-4 py-3">站点</th><th className="px-4 py-3">可用</th><th className="px-4 py-3">已预留</th></tr></thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.id} className="border-b last:border-0">
                <td className="px-4 py-3">{balance.sku.product.name} / {balance.sku.code}</td>
                <td className="px-4 py-3">{balance.site.name}</td>
                <td className="px-4 py-3 font-medium">{balance.onHandQuantity}</td>
                <td className="px-4 py-3">{balance.reservedQuantity}</td>
              </tr>
            ))}
            {balances.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">暂无库存，请先创建商品 SKU 后入库。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
