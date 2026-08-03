import { redirect } from "next/navigation";
import Link from "next/link";

import CrudPage from "@/components/admin/CrudPage";
import OrderBatchImport from "@/components/admin/OrderBatchImport";
import OrderEntryForm from "@/components/admin/OrderEntryForm";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { formatMoneyCents } from "@/lib/money";
import { createOrderAccessPlan } from "@/lib/order-access";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission, getEffectiveActions } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { zh } from "@/lib/i18n";
import OrderStatusCards from "@/components/admin/OrderStatusCards";

const ORDER_STATUSES = new Set<OrderStatus>(["DRAFT", "SUBMITTED", "WAITING_SHIPMENT", "SHIPPED", "DELIVERED", "EXCEPTION", "COMPLETED", "CANCELLED"]);

type OrdersSearchParams = {
  status?: string;
  employee?: string;
  product?: string;
  country?: string;
  q?: string;
  start?: string;
  end?: string;
  page?: string;
  pageSize?: string;
};

function parseDate(value?: string, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const params = await searchParams;
  const requestedStatus = params.status?.toUpperCase() as OrderStatus | undefined;
  const status = requestedStatus && ORDER_STATUSES.has(requestedStatus) ? requestedStatus : undefined;
  const employee = params.employee?.trim() || undefined;
  const product = params.product?.trim() || undefined;
  const country = params.country?.trim().toUpperCase() || undefined;
  const keyword = params.q?.trim() || undefined;
  const start = parseDate(params.start);
  const end = parseDate(params.end, true);
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 20;

  const [canCreate, canUploadOrderProof, canDeleteOrderProof, canSubmitForReview, effectiveActions, orderReadAccess] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.update",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: session.userId,
      targetMembershipId: membership.id,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attachment.delete",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: session.userId,
      targetMembershipId: membership.id,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.submit",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: session.userId,
      targetMembershipId: membership.id,
    }),
    getEffectiveActions(membership.id),
    createOrderAccessPlan({ membership, actionKey: "order.read" }),
  ]);
  const canDelete = effectiveActions.has("order.delete");
  if (!orderReadAccess.allowed) redirect("/admin");

  const products = await prisma.product.findMany({
    where: { isActive: true, businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, skus: { where: { isActive: true }, orderBy: { code: "asc" } } },
  });

  const sharedFilters = {
    ...(employee ? { creatorUserId: employee } : {}),
    ...(country ? { recipientCountryCode: country } : {}),
    ...(product ? { items: { some: { productName: { contains: product, mode: "insensitive" as const } } } } : {}),
    ...(keyword ? {
      OR: [
        { orderNo: { contains: keyword, mode: "insensitive" as const } },
        { recipientName: { contains: keyword, mode: "insensitive" as const } },
        { recipientEmail: { contains: keyword, mode: "insensitive" as const } },
        { recipientPhone: { contains: keyword, mode: "insensitive" as const } },
        { customerWhatsapp: { contains: keyword, mode: "insensitive" as const } },
      ],
    } : {}),
    ...((start || end) ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
  };
  const baseWhere = { businessUnitId: membership.businessUnitId, ...(status ? { status } : {}), ...sharedFilters };
  const scopedWhere = { AND: [orderReadAccess.where, baseWhere] };
  const statusScopeWhere = { AND: [orderReadAccess.where, { businessUnitId: membership.businessUnitId, ...sharedFilters }] };
  const totalCount = await prisma.order.count({ where: scopedWhere as Record<string, unknown> });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const [rows, statusGroups, templates, employeeOrderRows, countries] = await Promise.all([
    prisma.order.findMany({
      where: scopedWhere as Record<string, unknown>,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { code: true, name: true } },
        creatorUser: { select: { username: true } },
        items: { select: { id: true, quantity: true, productName: true } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], where: statusScopeWhere as Record<string, unknown>, _count: { _all: true } }),
    prisma.orderTemplate.findMany({
      where: { businessUnitId: membership.businessUnitId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, configuration: true, isDefault: true },
    }),
    prisma.order.findMany({
      where: statusScopeWhere,
      distinct: ["creatorUserId"],
      orderBy: [{ creatorUserId: "asc" }, { id: "asc" }],
      select: { creatorUserId: true, creatorUser: { select: { username: true, fullName: true } } },
    }),
    prisma.country.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { code: true, name: true } }),
  ]);
  const employees = employeeOrderRows
    .map((row) => ({ id: row.creatorUserId, username: row.creatorUser.username, fullName: row.creatorUser.fullName }))
    .sort((a, b) => a.username.localeCompare(b.username));

  const myOrderStats = statusGroups.reduce((stats, group) => {
    stats.total += group._count._all;
    const key = group.status.toLowerCase() as keyof typeof stats;
    if (key in stats && key !== "total") stats[key] = group._count._all;
    return stats;
  }, { total: 0, draft: 0, submitted: 0, waiting_shipment: 0, shipped: 0, delivered: 0, exception: 0, completed: 0, cancelled: 0 });
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams({
      status: status ?? "",
      employee: employee ?? "",
      product: product ?? "",
      country: country ?? "",
      q: keyword ?? "",
      start: params.start ?? "",
      end: params.end ?? "",
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    return `/admin/orders?${query}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">录入订单</h1>
        <p className="mt-1 text-sm text-gray-500">
          {status ? `当前状态：${zh(status)}，仅显示当前可见范围订单。` : "选择模板后快速提交并展示订单列表。"}
        </p>
      </div>
      <OrderEntryForm
        canCreate={canCreate.allowed}
        products={products}
        templates={templates.map((template) => ({
          ...template,
          configuration: parseOrderTemplateConfiguration(template.configuration),
        }))}
        countries={countries}
        canUploadOrderProof={canUploadOrderProof.allowed}
        canDeleteOrderProof={canDeleteOrderProof.allowed}
        canSubmitForReview={canSubmitForReview.allowed}
        myOrderStats={myOrderStats}
      />
      <OrderBatchImport canCreate={canCreate.allowed} />
      <OrderStatusCards groups={statusGroups.map((item) => ({ status: item.status, count: item._count._all }))} activeStatus={status} />
      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-8">
        <input type="hidden" name="status" value={status ?? ""} />
        <input name="q" defaultValue={keyword ?? ""} placeholder="订单号、客户、邮箱、电话、WhatsApp" className="rounded-xl border border-slate-200 px-3 py-2 text-sm xl:col-span-2" />
        <select name="employee" defaultValue={employee ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部销售</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.username}</option>)}</select>
        <input name="product" defaultValue={product ?? ""} placeholder="产品名称" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select name="country" defaultValue={country ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部目的地</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select>
        <input type="date" name="start" defaultValue={params.start ?? ""} aria-label="开始日期" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input type="date" name="end" defaultValue={params.end ?? ""} aria-label="结束日期" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">筛选</button>
      </form>
      <CrudPage
        apiBase="/api/mvp"
        resource="orders"
        listTitle="订单列表"
        detailPath="/admin/orders"
        showCreate={false}
        canCreate={canCreate.allowed}
        canDelete={canDelete}
        serverPagination={{ page, pageSize, total: totalCount, pageCount: totalPages }}
        rows={rows}
        rowId="id"
        createFields={[
          {
            key: "customerId",
            label: "客户",
            required: true,
            type: "select",
            options: [],
          },
          { key: "currency", label: "币种", required: false },
          {
            key: "productId",
            label: "商品",
            required: true,
            type: "select",
            options: products.map((product) => ({ value: product.id, label: `${product.code} ${product.name}` })),
          },
          {
            key: "skuId",
            label: "商品规格",
            required: true,
            type: "select",
            options: products.flatMap((product) =>
              product.skus.map((sku) => ({
                value: sku.id,
                label: `${product.code} / ${sku.code} - ${product.name}`,
              })),
            ),
          },
          { key: "productName", label: "商品名称", required: true },
          { key: "quantity", label: "数量", type: "number", required: true },
          { key: "unitPriceCents", label: "申报金额（分）", type: "number", required: true },
          { key: "codAmountCents", label: "货到付款金额（分）", type: "number", required: false },
          { key: "shippingFeeCents", label: "运费（分）", type: "number", required: false },
          { key: "note", label: "订单备注", required: false },
        ]}
        dataColumns={[
          { key: "orderNo", label: "订单号" },
          {
            key: "customer",
            label: "客户",
            render: (row) => {
              const customer = row.customer as { code?: string; name?: string } | undefined;
              return customer ? `${customer.code ?? ""} ${customer.name ?? ""}` : "";
            },
          },
          { key: "status", label: "订单状态" },
          {
            key: "shipStatusLabel",
            label: "运输状态",
            render: (row) => {
              const rowStatus = (row as { status?: string }).status;
              if (rowStatus === "SUBMITTED" || rowStatus === "WAITING_SHIPMENT") {
                return "运输中（待发货）";
              }
              return rowStatus ? zh(rowStatus as OrderStatus) : "-";
            },
          },
          {
            key: "amount",
            label: "订单金额",
            render: (row) => {
              const rowAny = row as unknown as { productValueCents?: number; shippingFeeCents?: number; currency?: string };
              const productValue = rowAny.productValueCents ?? 0;
              const shipping = rowAny.shippingFeeCents ?? 0;
              return formatMoneyCents(productValue + shipping, rowAny.currency ?? "CNY");
            },
          },
          {
            key: "items",
            label: "商品",
            render: (row) => {
              const items = row.items as { id?: string; quantity?: number; productName?: string }[] | undefined;
              return items?.length ? `${items.length} 件` : "0 件";
            },
          },
          {
            key: "creator",
            label: "录单员工",
            render: (row) => {
              const creator = row.creatorUser as { username?: string } | undefined;
              return creator?.username ?? "-";
            },
          },
          { key: "recipient", label: "收件人", render: (row) => String(row.recipientName ?? "-") },
          { key: "contact", label: "客户联系方式", render: (row) => [row.recipientEmail, row.customerWhatsapp, row.recipientPhone].filter(Boolean).join(" / ") || "-" },
          { key: "country", label: "目的地国家", render: (row) => String(row.recipientCountryCode ?? "-") },
        ]}
      />
      <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <form method="get" className="flex items-center gap-2">
          {Object.entries({ status: status ?? "", employee: employee ?? "", product: product ?? "", country: country ?? "", q: keyword ?? "", start: params.start ?? "", end: params.end ?? "" }).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <span>共 {totalCount} 条</span>
          <select name="pageSize" defaultValue={String(pageSize)} className="h-9 rounded-lg border border-slate-200 px-2"><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select>
          <button className="rounded-lg border border-slate-200 px-3 py-2">应用</button>
        </form>
        <div className="flex items-center gap-2"><span>第 {page}/{totalPages} 页</span>{page > 1 && <Link className="rounded-lg border px-3 py-1.5" href={pageHref(page - 1)}>上一页</Link>}{page < totalPages && <Link className="rounded-lg border px-3 py-1.5" href={pageHref(page + 1)}>下一页</Link>}</div>
      </div>
    </div>
  );
}
