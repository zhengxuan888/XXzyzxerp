import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import type { Prisma } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const queue = (await searchParams).queue;
  const queueWhere: Prisma.ShipmentWhereInput =
    queue === "needs_attention"
      ? { workStatus: "NEEDS_ATTENTION" as const }
      : queue === "in_transit"
        ? { status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } }
        : {};

  const canRead = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.shipment.findMany({
    where: { businessUnitId: membership.businessUnitId, status: { not: "PENDING" }, ...queueWhere },
    include: { order: { select: { orderNo: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="shipments"
      listTitle="Shipments"
      detailPath="/admin/shipments"
      canCreate={false}
      canDelete={false}
      rows={rows}
      createFields={[]}
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
