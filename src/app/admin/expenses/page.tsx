import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { formatMoneyCents } from "@/lib/money";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ExpensesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "expense.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "expense.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "expense.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const orders = await prisma.order.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNo: true },
  });

  const rows = await prisma.expense.findMany({
    where: { businessUnitId: membership.businessUnitId },
    include: { order: { select: { orderNo: true } }, actorUser: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="expenses"
      listTitle="Expenses"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        {
          key: "orderId",
          label: "Order",
          type: "select",
          required: false,
          options: orders.map((order) => ({ value: order.id, label: order.orderNo })),
        },
        { key: "category", label: "Category", required: true },
        { key: "amountCents", label: "Amount (Cents)", type: "number", required: true },
        { key: "paidAt", label: "Paid At (YYYY-MM-DD)" },
        { key: "currency", label: "Currency" },
        { key: "note", label: "Note" },
      ]}
      dataColumns={[
        { key: "category", label: "Category" },
        {
          key: "order",
          label: "Order",
          render: (row) => {
            const order = row.order as { orderNo?: string } | undefined;
            return order?.orderNo || "-";
          },
        },
        {
          key: "amount",
          label: "Amount",
          render: (row) => {
            const amount = Number(row.amountCents);
            const currency = String(row.currency || "CNY");
            return Number.isFinite(amount) ? formatMoneyCents(amount, currency) : "-";
          },
        },
        {
          key: "actorUser",
          label: "Operator",
          render: (row) => {
            const actor = row.actorUser as { username?: string } | undefined;
            return actor?.username || "-";
          },
        },
      ]}
    />
  );
}
