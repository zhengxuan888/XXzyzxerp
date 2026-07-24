import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import LogisticsReturnImport from "@/components/admin/LogisticsReturnImport";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function ShippingWorkbenchPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!permission.allowed) redirect("/admin");

  const [orders, pendingShipments] = await Promise.all([
    prisma.order.findMany({
      where: { businessUnitId: membership.businessUnitId, status: "WAITING_SHIPMENT" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, orderNo: true },
    }),
    prisma.shipment.findMany({
      where: { businessUnitId: membership.businessUnitId, status: "PENDING" },
      include: {
        order: { select: { orderNo: true, creatorUser: { select: { username: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-950">待发货工作台</h1>
        <p className="mt-1 text-sm text-slate-500">物流单号回填后仍是待发货；上传出货凭证并确认发货后，才进入物流追踪。</p>
      </header>
      <LogisticsReturnImport />
      <CrudPage
        apiBase="/api/mvp"
        resource="shipments"
        listTitle="已回填物流单号，等待确认发货"
        detailPath="/admin/orders"
        canCreate
        canDelete={false}
        rows={pendingShipments.map((shipment) => ({ ...shipment, id: shipment.orderId }))}
        createFields={[
          {
            key: "orderId",
            label: "订单",
            required: true,
            type: "select",
            options: orders.map((order) => ({ value: order.id, label: order.orderNo })),
          },
          { key: "carrier", label: "承运商/运输方式", required: true },
          { key: "trackingNo", label: "物流单号", required: true },
          { key: "memo", label: "备注" },
        ]}
        dataColumns={[
          {
            key: "order",
            label: "订单号",
            render: (row) => (row.order as { orderNo?: string } | undefined)?.orderNo ?? "-",
          },
          {
            key: "employee",
            label: "录单员工",
            render: (row) => (row.order as { creatorUser?: { username?: string } } | undefined)?.creatorUser?.username ?? "-",
          },
          { key: "trackingNo", label: "物流单号" },
          { key: "carrier", label: "运输方式" },
          { key: "status", label: "状态" },
        ]}
      />
    </div>
  );
}
