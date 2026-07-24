import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getActiveMembershipById } from "@/lib/auth";
import { formatMoneyCents } from "@/lib/money";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function OrderReviewWorkbenchPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "order.review",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!permission.allowed) redirect("/admin");
  const rows = await prisma.order.findMany({
    where: { businessUnitId: membership.businessUnitId, status: "SUBMITTED" },
    include: { customer: { select: { name: true } }, creatorUser: { select: { username: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold text-slate-950">核单工作台</h1><p className="mt-1 text-sm text-slate-500">仅显示员工已经提交、等待核对的订单。</p></header>
      <CrudPage
        apiBase="/api/mvp"
        resource="orders"
        listTitle="待核单"
        detailPath="/admin/orders"
        showCreate={false}
        canCreate={false}
        canDelete={false}
        rows={rows}
        createFields={[]}
        dataColumns={[
          { key: "orderNo", label: "订单号" },
          { key: "creator", label: "录单员工", render: (row) => (row.creatorUser as { username?: string })?.username ?? "-" },
          { key: "customer", label: "客户", render: (row) => (row.customer as { name?: string })?.name ?? "-" },
          { key: "amount", label: "COD金额", render: (row) => formatMoneyCents(Number(row.codAmountCents ?? 0), String(row.currency ?? "CNY")) },
          { key: "createdAt", label: "提交时间", render: (row) => new Date(String(row.createdAt)).toLocaleString("zh-CN") },
        ]}
      />
    </div>
  );
}
