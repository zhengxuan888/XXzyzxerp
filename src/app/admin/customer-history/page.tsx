import { ArrowUpRight, History, Repeat2, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { getActiveMembershipById } from "@/lib/auth";
import { zh } from "@/lib/i18n";
import { formatMoneyCents } from "@/lib/money";
import { resolveOrderReadScope, withOrderReadScope } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function CustomerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "order.read",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!permission.allowed) redirect("/admin");
  const orderReadScope = await resolveOrderReadScope(membership, session.userId);
  if (orderReadScope === "NONE") redirect("/admin");

  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const baseWhere: Prisma.OrderWhereInput = {
    businessUnitId: membership.businessUnitId,
    ...(q
      ? {
          OR: [
            { orderNo: { contains: q, mode: "insensitive" } },
            { recipientName: { contains: q, mode: "insensitive" } },
            { recipientPhone: { contains: q, mode: "insensitive" } },
            { recipientEmail: { contains: q, mode: "insensitive" } },
            { customerWhatsapp: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { contactPhone: { contains: q, mode: "insensitive" } } },
            { customer: { contactEmail: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const scopedWhere = withOrderReadScope(baseWhere as Record<string, unknown>, orderReadScope, membership, session.userId);
  const allVisibleWhere = withOrderReadScope(
    { businessUnitId: membership.businessUnitId },
    orderReadScope,
    membership,
    session.userId,
  );
  const [orders, historyCounts] = await Promise.all([
    prisma.order.findMany({
      where: scopedWhere as Prisma.OrderWhereInput,
      include: {
        customer: { select: { code: true, name: true, contactPhone: true, contactEmail: true } },
        creatorUser: { select: { username: true } },
      },
      orderBy: [{ orderedAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: allVisibleWhere as Prisma.OrderWhereInput,
      _count: { _all: true },
      _max: { orderedAt: true },
    }),
  ]);
  const countByCustomer = new Map(historyCounts.map((item) => [item.customerId, item._count._all]));
  const repeatCustomerCount = historyCounts.filter((item) => item._count._all > 1).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-violet-700"><History size={20} /><span className="text-sm font-semibold">客户中心</span></div>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">历史客户订单</h1>
          <p className="mt-1 text-sm text-slate-500">通过姓名、电话、邮箱或 WhatsApp，确认客户是否曾在当前业务范围内下过单。</p>
        </div>
        <div className="flex gap-3">
          <Metric label="可见订单" value={orders.length} />
          <Metric label="复购客户" value={repeatCustomerCount} accent />
        </div>
      </header>

      <form className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" method="get">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
          <Search size={17} className="text-slate-400" />
          <input name="q" defaultValue={q} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索客户姓名、电话、邮箱、WhatsApp或订单号" />
        </label>
        <button className="rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700">查询</button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">客户</th><th>联系方式</th><th>历史次数</th><th>订单号</th>
                <th>订单状态</th><th>COD金额</th><th>下单时间</th><th>录单员工</th><th className="pr-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const count = countByCustomer.get(order.customerId) ?? 1;
                return (
                  <tr key={order.id} className="hover:bg-violet-50/30">
                    <td className="px-4 py-3"><strong className="block text-slate-800">{order.customer.name}</strong><span className="text-xs text-slate-400">{order.customer.code}</span></td>
                    <td><span className="block">{order.recipientPhone || order.customer.contactPhone || "-"}</span><span className="text-xs text-slate-400">{order.customerWhatsapp || order.recipientEmail || order.customer.contactEmail || "-"}</span></td>
                    <td>{count > 1 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Repeat2 size={12} />复购 {count} 次</span> : <span className="text-slate-500">首次</span>}</td>
                    <td className="font-mono text-xs">{order.orderNo}</td>
                    <td>{zh(order.status)}</td>
                    <td>{formatMoneyCents(order.codAmountCents, order.currency)}</td>
                    <td>{order.orderedAt.toLocaleString("zh-CN")}</td>
                    <td>{order.creatorUser.username}</td>
                    <td className="pr-4 text-right"><Link href={`/admin/orders/${order.id}`} className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800">查看订单<ArrowUpRight size={14} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!orders.length && <div className="px-6 py-16 text-center text-sm text-slate-500">{q ? "没有找到匹配的历史订单。" : "当前可见范围内还没有客户订单。"}</div>}
        {orders.length === 200 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-amber-700">当前最多展示最近200条，请输入客户信息缩小查询范围。</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`min-w-24 rounded-xl px-4 py-3 ${accent ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"}`}><strong className="block text-xl">{value}</strong><span className="text-xs">{label}</span></div>;
}
