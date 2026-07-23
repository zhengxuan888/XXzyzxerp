import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { format } from "date-fns";
import OrderStatusForm from "@/components/admin/OrderStatusForm";
import { formatMoneyCents } from "@/lib/money";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) {
    redirect("/login");
  }

  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canStatusUpdate] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.status.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const order = await prisma.order.findFirst({
    where: {
      id: params.id,
      businessUnitId: membership.businessUnitId,
    },
    include: {
      customer: { select: { code: true, name: true } },
      creatorUser: { select: { username: true, fullName: true } },
      items: { include: { product: { select: { code: true, name: true } } } },
      shipments: { include: { events: true } },
    },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="rounded border border-gray-200 p-4">
        <p className="mb-4 text-xs text-gray-500">
          <Link href="/admin/orders" className="text-blue-700 hover:underline">
            Orders
          </Link>
        </p>
        <h1 className="text-xl font-semibold text-gray-900">Order {order.orderNo}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Customer: {order.customer?.code} {order.customer?.name}
        </p>
        <p className="text-sm text-gray-600">Status: {order.status}</p>
        <p className="text-sm text-gray-600">
          Amount: {formatMoneyCents(order.productValueCents + order.shippingFeeCents, order.currency)} | COD:{" "}
          {formatMoneyCents(order.codAmountCents, order.currency)}
        </p>
        <p className="text-sm text-gray-600">Creator: {order.creatorUser?.fullName ?? order.creatorUser?.username}</p>
        <p className="text-sm text-gray-600">Created: {format(order.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Items</h2>
          <ul className="space-y-2 text-sm">
            {order.items.length === 0 ? (
              <li className="text-gray-500">No items.</li>
            ) : (
              order.items.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>
                    {item.productName} × {item.quantity}x {item.product?.code}
                  </span>
                  <span className="text-gray-500">{formatMoneyCents(item.subtotalCents, order.currency)}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <OrderStatusForm orderId={order.id} currentStatus={order.status} canUpdate={canStatusUpdate.allowed} />
      </div>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Notes</h2>
        <p className="text-sm text-gray-600">Order note: {order.note || "-"}</p>
        <p className="text-sm text-gray-600">Exception note: {order.exceptionNote || "-"}</p>
      </section>
    </div>
  );
}
