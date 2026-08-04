import Link from "next/link";
import { redirect } from "next/navigation";

import OrderReviewQuickTable from "@/components/admin/OrderReviewQuickTable";
import { formatMoneyCents } from "@/lib/money";
import { getActiveMembershipById } from "@/lib/auth";
import { createOrderAccessPlan } from "@/lib/order-access";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

const tabs = [
  { key: "ALL", label: "全部" },
  { key: "REPEAT", label: "复购" },
  { key: "DUPLICATE", label: "重单" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

type Params = {
  tab?: string;
  search?: string;
  employee?: string;
  product?: string;
  country?: string;
  start?: string;
  end?: string;
  page?: string;
  pageSize?: string;
};

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

function duplicateKey(order: { recipientEmail: string | null; recipientPhone: string | null; customerWhatsapp: string | null; recipientCountryCode: string | null }) {
  const contact = (order.recipientEmail || order.customerWhatsapp || order.recipientPhone || "").trim().toLowerCase().replace(/\s+/g, "");
  return contact ? `${order.recipientCountryCode || "?"}:${contact}` : "";
}

export default async function OrderReviewWorkbenchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [reviewAccess, approveAccess, rejectAccess, cancelAccess] = await Promise.all([
    createOrderAccessPlan({ membership, actionKey: "order.review" }),
    createOrderAccessPlan({ membership, actionKey: "order.review.approve" }),
    createOrderAccessPlan({ membership, actionKey: "order.review.reject" }),
    createOrderAccessPlan({ membership, actionKey: "order.void" }),
  ]);
  if (!reviewAccess.allowed) redirect("/admin");

  const params = await searchParams;
  const tab = (tabs.some((item) => item.key === params.tab) ? params.tab : "ALL") as TabKey;
  const search = params.search?.trim() || "";
  const employee = params.employee?.trim() || "";
  const product = params.product?.trim() || "";
  const country = params.country?.trim().toUpperCase() || "";
  const start = validDate(params.start);
  const end = validDate(params.end);
  const endExclusive = end ? new Date(end.getTime() + 86_400_000) : null;
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 20;

  const where = {
    businessUnitId: membership.businessUnitId,
    status: "SUBMITTED" as const,
    ...(employee ? { creatorUserId: employee } : {}),
    ...(country ? { recipientCountryCode: country } : {}),
    ...(product ? { items: { some: { productName: { contains: product, mode: "insensitive" as const } } } } : {}),
    ...(search ? { OR: [
      { orderNo: { contains: search, mode: "insensitive" as const } },
      { recipientName: { contains: search, mode: "insensitive" as const } },
      { recipientEmail: { contains: search, mode: "insensitive" as const } },
      { recipientPhone: { contains: search, mode: "insensitive" as const } },
      { customerWhatsapp: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
    ...((start || endExclusive) ? { createdAt: { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } } : {}),
  };

  const [candidateIndex, rawCustomerHistory, countries] = await Promise.all([
    prisma.order.findMany({
      where: { AND: [reviewAccess.where, where] },
      select: {
        id: true,
        customerId: true,
        departmentId: true,
        siteId: true,
        creatorUserId: true,
        ownedByMembershipId: true,
        recipientEmail: true,
        recipientPhone: true,
        customerWhatsapp: true,
        recipientCountryCode: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.order.findMany({
      where: { AND: [reviewAccess.where, { businessUnitId: membership.businessUnitId, status: { notIn: ["DRAFT", "CANCELLED"] } }] },
      select: {
        id: true,
        customerId: true,
        departmentId: true,
        siteId: true,
        creatorUserId: true,
        ownedByMembershipId: true,
      },
    }),
    prisma.country.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const customerHistoryCounts = new Map<string, number>();
  rawCustomerHistory.forEach((order) => {
    customerHistoryCounts.set(order.customerId, (customerHistoryCounts.get(order.customerId) ?? 0) + 1);
  });
  const repeatCustomers = new Set([...customerHistoryCounts].filter(([, count]) => count > 1).map(([customerId]) => customerId));
  const visibleEmployeeIds = [...new Set(candidateIndex.map((order) => order.creatorUserId))];
  const employees = visibleEmployeeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: visibleEmployeeIds } },
        select: { id: true, username: true, fullName: true },
        orderBy: [{ fullName: "asc" }, { username: "asc" }],
      })
    : [];
  const duplicateCounts = new Map<string, number>();
  candidateIndex.forEach((order) => {
    const key = duplicateKey(order);
    if (key) duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  });
  const isDuplicate = (order: (typeof candidateIndex)[number]) => {
    const key = duplicateKey(order);
    return Boolean(key && (duplicateCounts.get(key) ?? 0) > 1);
  };
  const classified = {
    ALL: candidateIndex,
    REPEAT: candidateIndex.filter((order) => repeatCustomers.has(order.customerId)),
    DUPLICATE: candidateIndex.filter(isDuplicate),
  };
  const selected = classified[tab];
  const totalPages = Math.max(1, Math.ceil(selected.length / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const pageIds = selected.slice((safePage - 1) * pageSize, safePage * pageSize).map((order) => order.id);
  const rows = pageIds.length
    ? await prisma.order.findMany({
        where: { AND: [reviewAccess.where, { id: { in: pageIds }, businessUnitId: membership.businessUnitId }] },
        include: {
          customer: { select: { id: true, name: true } },
          creatorUser: { select: { id: true, username: true, fullName: true } },
          items: { select: { productName: true, quantity: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];
  const reviewConfiguration = parseOrderTemplateConfiguration(undefined);
  const quickRows = rows.map((order) => {
    const target = {
      businessUnitId: membership.businessUnitId,
      departmentId: order.departmentId,
      siteId: order.siteId,
      ownerMembershipId: order.ownedByMembershipId,
    };
    return {
      id: order.id,
      orderNo: order.orderNo,
      employee: order.creatorUser.fullName || order.creatorUser.username,
      recipient: order.recipientName || order.customer.name,
      contact: order.recipientEmail || order.customerWhatsapp || order.recipientPhone || "-",
      phone: order.recipientPhone || "",
      whatsapp: order.customerWhatsapp || "",
      shopId: order.shopId || "",
      address: order.recipientAddress || "",
      productSummary: order.items.map((item) => `${item.productName} × ${item.quantity}`).join("、") || "-",
      country: order.recipientCountryCode || "-",
      amount: formatMoneyCents(order.codAmountCents, order.currency),
      submittedAt: order.createdAt.toLocaleString("zh-CN"),
      permissions: {
        approve: approveAccess.allows(target),
        reject: rejectAccess.allows(target),
        cancel: cancelAccess.allows(target),
      },
    };
  });

  const query = (overrides: Partial<Params>) => {
    const next = new URLSearchParams({
      tab,
      search,
      employee,
      product,
      country,
      start: params.start || "",
      end: params.end || "",
      page: String(safePage),
      pageSize: String(pageSize),
      ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, value ?? ""])),
    });
    return `/admin/order-review?${next}`;
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-amber-700">销售与订单</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">核单工作台</h1>
        <p className="mt-1 text-sm text-slate-500">打开订单即可直接核单；复购和重单由真实历史订单与客户联系方式自动识别。</p>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((item) => <Link key={item.key} href={query({ tab: item.key, page: "1" })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item.key ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-amber-50"}`}>{item.label}<span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === item.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{classified[item.key].length}</span></Link>)}
      </nav>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-4 xl:grid-cols-8">
        <input type="hidden" name="tab" value={tab} />
        <input name="search" defaultValue={search} placeholder="订单号、客户、邮箱、电话、WhatsApp" className="h-10 rounded-xl border border-slate-200 px-3 text-sm lg:col-span-2" />
        <select name="employee" defaultValue={employee} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="">全部录单员工</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.username}</option>)}</select>
        <input name="product" defaultValue={product} placeholder="产品名称" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <select name="country" defaultValue={country} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="">全部目的地</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select>
        <input type="date" name="start" defaultValue={params.start || ""} aria-label="开始日期" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <input type="date" name="end" defaultValue={params.end || ""} aria-label="结束日期" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <button className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">筛选</button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <OrderReviewQuickTable rows={quickRows} reviewRejectReasons={reviewConfiguration.reviewRejectReasons} voidReasons={reviewConfiguration.voidReasons} />
        {!rows.length && <p className="px-4 py-12 text-center text-sm text-slate-400">当前筛选暂无待核单订单</p>}
        <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <form method="get" className="flex items-center gap-2">{Object.entries({ tab, search, employee, product, country, start: params.start || "", end: params.end || "" }).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<span>共 {selected.length} 条</span><select name="pageSize" defaultValue={String(pageSize)} className="h-9 rounded-lg border border-slate-200 px-2"><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select><button className="rounded-lg border border-slate-200 px-3 py-2">应用</button></form>
          <div className="flex items-center gap-2"><span>第 {safePage}/{totalPages} 页</span>{safePage > 1 && <Link className="rounded-lg border border-slate-200 px-3 py-2" href={query({ page: String(safePage - 1) })}>上一页</Link>}{safePage < totalPages && <Link className="rounded-lg border border-slate-200 px-3 py-2" href={query({ page: String(safePage + 1) })}>下一页</Link>}</div>
        </footer>
      </section>
    </div>
  );
}
