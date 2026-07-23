import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ShipmentsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const orders = await prisma.order.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNo: true },
  });

  const rows = await prisma.shipment.findMany({
    where: { businessUnitId: membership.businessUnitId },
    include: { order: { select: { orderNo: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="shipments"
      listTitle="Shipments"
      canCreate={canCreate.allowed}
      canDelete={false}
      rows={rows}
      createFields={[
        {
          key: "orderId",
          label: "Order",
          required: true,
          type: "select",
          options: orders.map((order) => ({ value: order.id, label: order.orderNo })),
        },
        { key: "carrier", label: "Carrier" },
        { key: "trackingNo", label: "Tracking No" },
        { key: "memo", label: "Remark" },
      ]}
      dataColumns={[
        { key: "trackingNo", label: "Tracking No" },
        {
          key: "order",
          label: "Order",
          render: (row) => {
            const value = row.order as { orderNo?: string } | undefined;
            return value?.orderNo ?? "-";
          },
        },
        { key: "carrier", label: "Carrier" },
        { key: "status", label: "Status" },
        {
          key: "createdAt",
          label: "Created",
          render: (row) => {
            const value = row.createdAt;
            const createdAt = typeof value === "string" ? new Date(value) : value;
            return createdAt ? createdAt.toLocaleString() : "-";
          },
        },
      ]}
    />
  );
}
