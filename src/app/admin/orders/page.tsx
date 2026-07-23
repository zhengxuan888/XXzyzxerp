import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import OrderEntryForm from "@/components/admin/OrderEntryForm";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { formatMoneyCents } from "@/lib/money";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function OrdersPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

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

  const [rows, templates] = await Promise.all([prisma.order.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { code: true, name: true } },
      creatorUser: { select: { username: true } },
      items: { select: { id: true, quantity: true, productName: true } },
    },
  }), prisma.orderTemplate.findMany({
    where: { businessUnitId: membership.businessUnitId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, configuration: true, isDefault: true },
  })]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">录入订单</h1>
        <p className="mt-1 text-sm text-gray-500">选择模板后自动带出渠道、币种、运费和必填规则。</p>
      </div>
      <OrderEntryForm
        canCreate={canCreate.allowed}
        customers={customers}
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
      showCreate={false}
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      rowId="id"
      createFields={[
        {
          key: "customerId",
          label: "Customer",
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
              label: `${product.code} / ${sku.code} · ${product.name}`,
            })),
          ),
        },
        { key: "productName", label: "Product Name", required: true },
        { key: "quantity", label: "Quantity", type: "number", required: true },
        { key: "unitPriceCents", label: "Unit Price (Cents)", type: "number", required: true },
        { key: "codAmountCents", label: "COD Amount (Cents)", type: "number", required: false },
        { key: "shippingFeeCents", label: "Shipping Fee (Cents)", type: "number", required: false },
        { key: "note", label: "Order Note", required: false },
      ]}
      dataColumns={[
        { key: "orderNo", label: "Order No." },
        {
          key: "customer",
          label: "Customer",
          render: (row) => {
            const customer = row.customer as { code?: string; name?: string } | undefined;
            return customer ? `${customer.code ?? ""} ${customer.name ?? ""}` : "";
          },
        },
        { key: "status", label: "Status" },
        {
          key: "amount",
          label: "Amount",
          render: (row) => {
            const rowAny = row as unknown as { productValueCents?: number; shippingFeeCents?: number; currency?: string };
            const productValue = rowAny.productValueCents ?? 0;
            const shipping = rowAny.shippingFeeCents ?? 0;
            return formatMoneyCents(productValue + shipping, rowAny.currency ?? "CNY");
          },
        },
        {
          key: "items",
          label: "Items",
          render: (row) => {
            const items = row.items as { id?: string; quantity?: number; productName?: string }[] | undefined;
            return items?.length ? `${items.length} items` : "0";
          },
        },
        {
          key: "creator",
          label: "Creator",
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
