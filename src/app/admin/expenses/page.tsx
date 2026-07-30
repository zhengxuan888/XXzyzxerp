import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import ExpenseImportPanel from "@/components/admin/ExpenseImportPanel";
import { getActiveMembershipById } from "@/lib/auth";
import { formatMoneyCents } from "@/lib/money";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function ExpensesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = (actionKey: string) => checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey,
    targetBusinessUnitId: membership.businessUnitId,
  });
  const [canRead, canCreate, canDelete, canImport] = await Promise.all([
    permission("expense.read"),
    permission("expense.create"),
    permission("expense.delete"),
    permission("expense.import"),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const orderScope = {
    businessUnitId: membership.businessUnitId,
    ...(membership.departmentId ? { departmentId: membership.departmentId } : {}),
  };
  const [orders, rows] = await Promise.all([
    prisma.order.findMany({
      where: orderScope,
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNo: true },
    }),
    prisma.expense.findMany({
      where: orderScope,
      include: { order: { select: { orderNo: true } }, actorUser: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      {canImport.allowed && <ExpenseImportPanel />}
      <CrudPage
        apiBase="/api/mvp"
        resource="expenses"
        listTitle="费用与支出"
        canCreate={canCreate.allowed}
        canDelete={canDelete.allowed}
        rows={rows}
        createFields={[
          {
            key: "orderId",
            label: "关联订单",
            type: "select",
            required: false,
            options: orders.map((order) => ({ value: order.id, label: order.orderNo })),
          },
          { key: "category", label: "费用类别", required: true },
          { key: "amountCents", label: "金额（分）", type: "number", required: true },
          { key: "paidAt", label: "付款日期（YYYY-MM-DD）" },
          { key: "currency", label: "币种" },
          { key: "note", label: "备注" },
        ]}
        dataColumns={[
          { key: "category", label: "费用类别" },
          {
            key: "order",
            label: "关联订单",
            render: (row) => (row.order as { orderNo?: string } | undefined)?.orderNo || "-",
          },
          {
            key: "amount",
            label: "金额",
            render: (row) => {
              const amount = Number(row.amountCents);
              return Number.isFinite(amount) ? formatMoneyCents(amount, String(row.currency || "CNY")) : "-";
            },
          },
          {
            key: "actorUser",
            label: "操作人",
            render: (row) => (row.actorUser as { username?: string } | undefined)?.username || "-",
          },
        ]}
      />
    </>
  );
}
