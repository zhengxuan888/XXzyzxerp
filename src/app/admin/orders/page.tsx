import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
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
    select: { id: true, code: true, name: true },
  });

  const rows = await prisma.order.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { code: true, name: true } },
      creatorUser: { select: { username: true } },
      items: { select: { id: true, quantity: true, productName: true } },
    },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="orders"
      listTitle="Orders"
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
  );
}
