import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import InventoryAdjustmentForm from "@/components/admin/InventoryAdjustmentForm";
import { getActiveMembershipById } from "@/lib/auth";
import {
  enrichInventoryRows,
  filterInventoryRows,
  sortInventoryRows,
  summarizeInventoryRows,
  type InventorySort,
  type InventoryStockFilter,
  type InventoryStockStatus,
} from "@/lib/inventory-workbench";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type InventorySearchParams = {
  q?: string;
  siteId?: string;
  stock?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

const stockFilters: InventoryStockFilter[] = ["ALL", "NORMAL", "LOW_STOCK", "OUT_OF_STOCK"];
const sortOptions: InventorySort[] = ["UPDATED_DESC", "AVAILABLE_ASC", "AVAILABLE_DESC", "SKU_ASC"];

function stockLabel(status: InventoryStockStatus) {
  if (status === "LOW_STOCK") return "低库存";
  if (status === "OUT_OF_STOCK") return "缺货";
  return "正常";
}

function stockClass(status: InventoryStockStatus) {
  if (status === "LOW_STOCK") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "OUT_OF_STOCK") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function pageHref(values: Omit<Required<InventorySearchParams>, "page"> & { page: number }) {
  const query = new URLSearchParams({
    q: values.q,
    siteId: values.siteId,
    stock: values.stock,
    sort: values.sort,
    page: String(values.page),
    pageSize: values.pageSize,
  });
  return `/admin/inventory?${query}`;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const keyword = params.q?.trim().slice(0, 120) ?? "";
  const siteId = params.siteId?.trim() ?? "";
  const stock = stockFilters.includes(params.stock as InventoryStockFilter) ? params.stock as InventoryStockFilter : "ALL";
  const sort = sortOptions.includes(params.sort as InventorySort) ? params.sort as InventorySort : "UPDATED_DESC";
  const pageSize = [10, 20, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 20;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [canRead, canAdjust, canReadProduct] = await Promise.all([
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "inventory.read", targetBusinessUnitId: membership.businessUnitId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "inventory.adjust", targetBusinessUnitId: membership.businessUnitId, targetSiteId: membership.siteId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "product.read", targetBusinessUnitId: membership.businessUnitId }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const where: Prisma.InventoryBalanceWhereInput = {
    businessUnitId: membership.businessUnitId,
    ...(siteId ? { siteId } : {}),
    ...(keyword ? {
      OR: [
        { sku: { is: { code: { contains: keyword, mode: "insensitive" } } } },
        { sku: { is: { barcode: { contains: keyword, mode: "insensitive" } } } },
        { sku: { is: { product: { is: { code: { contains: keyword, mode: "insensitive" } } } } } },
        { sku: { is: { product: { is: { name: { contains: keyword, mode: "insensitive" } } } } } },
        { site: { is: { code: { contains: keyword, mode: "insensitive" } } } },
        { site: { is: { name: { contains: keyword, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const [balances, sites, skus] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where,
      include: { site: { select: { id: true, code: true, name: true } }, sku: { include: { product: { select: { id: true, code: true, name: true } } } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.site.findMany({ where: { businessUnitId: membership.businessUnitId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    prisma.productSku.findMany({
      where: { isActive: true, product: { businessUnitId: membership.businessUnitId, isActive: true } },
      include: { product: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    }),
  ]);

  const enriched = enrichInventoryRows(balances);
  const summary = summarizeInventoryRows(enriched);
  const filtered = sortInventoryRows(filterInventoryRows(enriched, stock), sort);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const currentFilters = { q: keyword, siteId, stock, sort, pageSize: String(pageSize) };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">商品与库存</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">库存工作台</h1>
        <p className="mt-1 text-sm text-slate-500">可售库存 = 在库 − 已预留。安全库存由 SKU 资料配置，低库存与缺货会按当前业务板块自动计算。</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="库存 SKU" value={summary.skuCount} hint={`${summary.balanceCount} 条站点库存记录`} tone="slate" />
        <Metric label="在库数量" value={summary.onHandQuantity} hint="所有当前筛选范围" tone="sky" />
        <Metric label="可售数量" value={summary.availableQuantity} hint="已扣除订单预留" tone="emerald" />
        <Metric label="已预留" value={summary.reservedQuantity} hint="待处理订单占用" tone="violet" />
        <Metric label="低库存 SKU" value={summary.lowStockSkuCount} hint="可售量低于安全库存" tone="amber" />
        <Metric label="缺货 SKU" value={summary.outOfStockSkuCount} hint="可售量为 0 或异常" tone="rose" />
      </section>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
        <input name="q" defaultValue={keyword} placeholder="商品、SKU、条码、站点" className="rounded-xl border border-slate-200 px-3 py-2 text-sm xl:col-span-2" />
        <select name="siteId" defaultValue={siteId} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部站点</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select>
        <select name="stock" defaultValue={stock} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="ALL">全部库存状态</option><option value="NORMAL">正常</option><option value="LOW_STOCK">低库存</option><option value="OUT_OF_STOCK">缺货</option></select>
        <select name="sort" defaultValue={sort} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="UPDATED_DESC">最近更新</option><option value="AVAILABLE_ASC">可售量从少到多</option><option value="AVAILABLE_DESC">可售量从多到少</option><option value="SKU_ASC">SKU 编码</option></select>
        <button className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">筛选库存</button>
      </form>

      <InventoryAdjustmentForm
        canAdjust={canAdjust.allowed}
        sites={sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))}
        skus={skus.map((sku) => ({ id: sku.id, label: `${sku.product.code}/${sku.code} · ${sku.product.name}` }))}
      />

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">商品 / SKU</th><th className="px-4 py-3">站点</th><th className="px-4 py-3 text-right">在库</th><th className="px-4 py-3 text-right">预留</th><th className="px-4 py-3 text-right">本站可售</th><th className="px-4 py-3 text-right">SKU 总可售</th><th className="px-4 py-3 text-right">安全库存</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">更新时间</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3"><div className="font-semibold text-slate-900">{canReadProduct.allowed ? <Link className="hover:text-violet-700 hover:underline" href={`/admin/products/${row.sku.product.id}`}>{row.sku.product.name}</Link> : row.sku.product.name}</div><div className="mt-0.5 text-xs text-slate-500">{row.sku.product.code} / {row.sku.code}{row.sku.barcode ? ` · ${row.sku.barcode}` : ""}</div></td>
                <td className="px-4 py-3">{row.site.code} · {row.site.name}</td>
                <td className="px-4 py-3 text-right font-medium">{row.onHandQuantity}</td><td className="px-4 py-3 text-right">{row.reservedQuantity}</td><td className="px-4 py-3 text-right font-semibold">{row.availableQuantity}</td><td className="px-4 py-3 text-right">{row.skuAvailableQuantity}</td><td className="px-4 py-3 text-right">{row.sku.safetyStockQuantity}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${stockClass(row.stockStatus)}`}>{stockLabel(row.stockStatus)}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500">{row.updatedAt.toLocaleString("zh-CN")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">当前筛选条件下没有库存记录。创建商品/SKU 后可通过库存调整录入开盘库存或入库数量。</td></tr>}
          </tbody>
        </table>
      </section>

      <footer className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <form method="get" className="flex items-center gap-2">
          {Object.entries({ q: keyword, siteId, stock, sort }).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <span>共 {total} 条</span><select name="pageSize" defaultValue={String(pageSize)} className="h-9 rounded-lg border border-slate-200 px-2"><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select><button className="rounded-lg border border-slate-200 px-3 py-2">应用</button>
        </form>
        <div className="flex items-center gap-2"><span>第 {page}/{totalPages} 页</span>{page > 1 && <Link className="rounded-lg border border-slate-200 px-3 py-1.5" href={pageHref({ ...currentFilters, page: page - 1 })}>上一页</Link>}{page < totalPages && <Link className="rounded-lg border border-slate-200 px-3 py-1.5" href={pageHref({ ...currentFilters, page: page + 1 })}>下一页</Link>}</div>
      </footer>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "slate" | "sky" | "emerald" | "violet" | "amber" | "rose" }) {
  const tones = { slate: "border-slate-200 bg-slate-50", sky: "border-sky-200 bg-sky-50", emerald: "border-emerald-200 bg-emerald-50", violet: "border-violet-200 bg-violet-50", amber: "border-amber-200 bg-amber-50", rose: "border-rose-200 bg-rose-50" };
  return <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}
