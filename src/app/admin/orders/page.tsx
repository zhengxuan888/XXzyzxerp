import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
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

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const requestedStatus = (await searchParams).status?.toUpperCase() as OrderStatus | undefined;
  const status = requestedStatus && ORDER_STATUSES.has(requestedStatus) ? requestedStatus : undefined;

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

  const customers = await prisma.customer.findMany({
    where: { isActive: true, businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true },
  });
  const products = await prisma.product.findMany({
    where: { isActive: true, businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, skus: { where: { isActive: true }, orderBy: { code: "asc" } } },
  });

  const baseWhere = { businessUnitId: membership.businessUnitId, ...(status ? { status } : {}) };
  const scopedWhere = withOrderReadScope(baseWhere, orderReadScope, membership, session.userId);
  const customerHistory = await prisma.order.groupBy({
    by: ["customerId"],
    where: scopedWhere as Record<string, unknown>,
    _count: { _all: true },
    _max: { orderedAt: true },
  });
  const historyByCustomer = new Map(customerHistory.map((item) => [item.customerId, item]));

  const [rows, templates] = await Promise.all([
    prisma.order.findMany({
      where: scopedWhere as Record<string, unknown>,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { code: true, name: true } },
        creatorUser: { select: { username: true } },
        items: { select: { id: true, quantity: true, productName: true } },
      },
    }),
    prisma.orderTemplate.findMany({
      where: { businessUnitId: membership.businessUnitId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, configuration: true, isDefault: true },
    }),
  ]);

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
        customers={customers.map((customer) => {
          const history = historyByCustomer.get(customer.id);
          return {
            ...customer,
            orderCount: history?._count._all ?? 0,
            lastOrderedAt: history?._max.orderedAt?.toISOString() ?? null,
          };
        })}
        products={products}
        templates={templates.map((template) => ({
          ...template,
          configuration: parseOrderTemplateConfiguration(template.configuration),
        }))}
      />
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
            options: customers.map((customer) => ({ value: customer.id, label: `${customer.code} ${customer.name}` })),
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
        ]}
      />
    </div>
  );
}
