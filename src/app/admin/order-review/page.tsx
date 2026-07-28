import Link from "next/link";
import { redirect } from "next/navigation";
import CrudPage from "@/components/admin/CrudPage";
import { getActiveMembershipById } from "@/lib/auth";
import { formatMoneyCents } from "@/lib/money";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

const tabs = [{ key: "ALL", label: "全部" }, { key: "SUBMITTED", label: "待核单" }, { key: "REVIEWING", label: "审核中" }, { key: "REPEAT", label: "复购" }, { key: "DUPLICATE", label: "重单" }];

export default async function OrderReviewWorkbenchPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = await checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "order.review", targetBusinessUnitId: membership.businessUnitId });
  if (!permission.allowed) redirect("/admin");
  const params = await searchParams;
  const tab = params.tab && tabs.some((item) => item.key === params.tab) ? params.tab : "SUBMITTED";
  const base = { businessUnitId: membership.businessUnitId };
  const statuses = tab === "ALL" ? undefined : tab === "SUBMITTED" || tab === "REVIEWING" ? { status: "SUBMITTED" as const } : undefined;
  const where = { ...base, ...(statuses ?? {}) };
  const [rows, grouped] = await Promise.all([
    prisma.order.findMany({ where, include: { customer: { select: { name: true } }, creatorUser: { select: { username: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 }),
    prisma.order.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const submittedCount = grouped.find((item) => item.status === "SUBMITTED")?._count._all ?? 0;
  const countFor = (key: string) => key === "ALL" ? grouped.reduce((sum, item) => sum + item._count._all, 0) : key === "SUBMITTED" || key === "REVIEWING" ? submittedCount : 0;
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold text-slate-950">核单工作台</h1><p className="mt-1 text-sm text-slate-500">快捷筛选订单状态，选择订单进入详情并完成核单。</p></header><nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{tabs.map((item) => <Link key={item.key} href={`/admin/order-review?tab=${item.key}`} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item.key ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item.label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{countFor(item.key)}</span></Link>)}</nav><CrudPage apiBase="/api/mvp" resource="orders" listTitle="待核单订单" detailPath="/admin/orders" showCreate={false} canCreate={false} canDelete={false} rows={rows} createFields={[]} dataColumns={[{ key: "orderNo", label: "订单号" }, { key: "creator", label: "录单员工", render: (row) => (row.creatorUser as { username?: string })?.username ?? "-" }, { key: "customer", label: "客户", render: (row) => (row.customer as { name?: string })?.name ?? "-" }, { key: "amount", label: "COD金额", render: (row) => formatMoneyCents(Number(row.codAmountCents ?? 0), String(row.currency ?? "CNY")) }, { key: "createdAt", label: "提交时间", render: (row) => new Date(String(row.createdAt)).toLocaleString("zh-CN") }]} /></div>;
}
