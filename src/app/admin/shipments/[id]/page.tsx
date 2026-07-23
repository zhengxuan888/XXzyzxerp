import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ShipmentEventForm from "@/components/admin/ShipmentEventForm";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

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
          Shipments
        </Link>
      </p>
      <h1 className="text-xl font-semibold text-gray-900">Shipment {shipment.id}</h1>
      <p className="text-sm text-gray-600">Order: {shipment.order.orderNo}</p>
      <p className="text-sm text-gray-600">Tracking No: {shipment.trackingNo || "-"}</p>
      <p className="text-sm text-gray-600">Carrier: {shipment.carrier || "-"}</p>
      <p className="text-sm text-gray-600">Current Status: {shipment.status}</p>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Events</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {shipment.events.length === 0 ? (
              <li className="text-gray-500">No events.</li>
            ) : (
              shipment.events.map((item) => (
                <li key={item.id} className="rounded border border-gray-100 p-2">
                  <p className="font-medium">{item.eventType}</p>
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
