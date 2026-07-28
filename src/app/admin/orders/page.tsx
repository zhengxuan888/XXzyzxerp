import { redirect } from "next/navigation";
import Link from "next/link";

import CrudPage from "@/components/admin/CrudPage";
import OrderBatchImport from "@/components/admin/OrderBatchImport";
import OrderEntryForm from "@/components/admin/OrderEntryForm";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { formatMoneyCents } from "@/lib/money";
import { resolveOrderReadScope, withOrderReadScope } from "@/lib/order-access";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { zh } from "@/lib/i18n";

const ORDER_STATUSES = new Set<OrderStatus>(["DRAFT", "SUBMITTED", "WAITING_SHIPMENT", "SHIPPED", "DELIVERED", "EXCEPTION", "COMPLETED", "CANCELLED"]);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; employee?: string; product?: string; country?: string; page?: string }> }) {
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
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 20;

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const orderReadScope = await resolveOrderReadScope(membership, session.userId);
  if (orderReadScope === "NONE") redirect("/admin");

  const products = await prisma.product.findMany({
    where: { isActive: true, businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, skus: { where: { isActive: true }, orderBy: { code: "asc" } } },
  });

  const baseWhere = { businessUnitId: membership.businessUnitId, ...(status ? { status } : {}), ...(employee ? { creatorUserId: employee } : {}), ...(country ? { recipientCountryCode: country } : {}), ...(product ? { items: { some: { productName: { contains: product, mode: "insensitive" as const } } } } : {}) };
  const scopedWhere = withOrderReadScope(baseWhere, orderReadScope, membership, session.userId);
  const [rows, totalCount, templates, employees, countries] = await Promise.all([
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
    prisma.order.count({ where: scopedWhere as Record<string, unknown> }),
    prisma.orderTemplate.findMany({
      where: { businessUnitId: membership.businessUnitId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, configuration: true, isDefault: true },
    }),
    prisma.user.findMany({ where: { memberships: { some: { businessUnitId: membership.businessUnitId, isActive: true } } }, orderBy: { username: "asc" }, select: { id: true, username: true, fullName: true } }),
    prisma.country.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { code: true, name: true } }),
  ]);

  const myOrderStats = rows.reduce((stats, row) => {
    stats.total += 1;
    const key = row.status.toLowerCase() as keyof typeof stats;
    if (key in stats && key !== "total") stats[key] += 1;
    return stats;
  }, { total: 0, draft: 0, submitted: 0, waiting_shipment: 0, shipped: 0, delivered: 0, exception: 0, completed: 0, cancelled: 0 });

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
        myOrderStats={myOrderStats}
      />
      <OrderBatchImport canCreate={canCreate.allowed} />
      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input type="hidden" name="status" value={status ?? ""} />
        <select name="employee" defaultValue={employee ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">全部录单员工</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.username}</option>)}</select>
        <input name="product" defaultValue={product ?? ""} placeholder="产品名称" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="country" defaultValue={country ?? ""} placeholder="目的地国家代码，如 ES" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">筛选</button>
      </form>
      <CrudPage
        apiBase="/api/mvp"
        resource="orders"
        listTitle="订单列表"
        detailPath="/admin/orders"
        showCreate={false}
        canCreate={canCreate.allowed}
        canDelete={canDelete.allowed}
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
          { key: "currency", label: "Currency", required: false },
          {
            key: "productId",
            label: "Product",
            required: true,
            type: "select",
            options: products.map((product) => ({ value: product.id, label: `${product.code} ${product.name}` })),
          },
          {
            key: "skuId",
            label: "SKU",
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
          { key: "unitPriceCents", label: "商品金额（分）", type: "number", required: true },
          { key: "codAmountCents", label: "COD 金额（分）", type: "number", required: false },
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
      <div className="flex items-center justify-between text-sm text-slate-500"><span>共 {totalCount} 条，第 {page} / {Math.max(1, Math.ceil(totalCount / pageSize))} 页</span><div className="flex gap-2">{page > 1 && <Link className="rounded-lg border px-3 py-1.5" href={`/admin/orders?status=${status ?? ""}&employee=${employee ?? ""}&product=${product ?? ""}&country=${country ?? ""}&page=${page - 1}`}>上一页</Link>}{page < Math.ceil(totalCount / pageSize) && <Link className="rounded-lg border px-3 py-1.5" href={`/admin/orders?status=${status ?? ""}&employee=${employee ?? ""}&product=${product ?? ""}&country=${country ?? ""}&page=${page + 1}`}>下一页</Link>}</div></div>
    </div>
  );
}
