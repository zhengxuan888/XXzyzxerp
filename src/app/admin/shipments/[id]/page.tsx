import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ShipmentEventForm from "@/components/admin/ShipmentEventForm";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { zh } from "@/lib/i18n";

export default async function ShipmentDetailPage({ params }: { params: { id: string } }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const canRead = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!canRead.allowed) redirect("/admin");

  const shipment = await prisma.shipment.findFirst({
    where: {
      id: params.id,
      businessUnitId: membership.businessUnitId,
    },
    include: {
      order: { select: { orderNo: true } },
      events: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!shipment) notFound();

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        <Link href="/admin/shipments" className="text-blue-700 hover:underline">
          发货与物流
        </Link>
      </p>
      <h1 className="text-xl font-semibold text-gray-900">物流单 {shipment.id}</h1>
      <p className="text-sm text-gray-600">订单：{shipment.order.orderNo}</p>
      <p className="text-sm text-gray-600">物流单号：{shipment.trackingNo || "-"}</p>
      <p className="text-sm text-gray-600">承运商：{shipment.carrier || "-"}</p>
      <p className="text-sm text-gray-600">当前状态：{zh(shipment.status)}</p>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">物流轨迹</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {shipment.events.length === 0 ? (
              <li className="text-gray-500">暂无物流轨迹。</li>
            ) : (
              shipment.events.map((item) => (
                <li key={item.id} className="rounded border border-gray-100 p-2">
                  <p className="font-medium">{zh(item.eventType)}</p>
                  <p>{item.memo || "-"}</p>
                  <p className="text-xs text-gray-500">{new Date(item.occurredAt).toLocaleString()}</p>
                </li>
              ))
            )}
          </ul>
        </div>

        <ShipmentEventForm shipmentId={shipment.id} />
      </section>
    </div>
  );
}
