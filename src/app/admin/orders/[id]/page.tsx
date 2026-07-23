import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { format } from "date-fns";
import OrderStatusForm from "@/components/admin/OrderStatusForm";
import { formatMoneyCents } from "@/lib/money";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { zh } from "@/lib/i18n";

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
      orderTemplate: { select: { code: true, name: true } },
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
            订单管理
          </Link>
        </p>
        <h1 className="text-xl font-semibold text-gray-900">订单 {order.orderNo}</h1>
        <p className="mt-2 text-sm text-gray-600">
          客户：{order.customer?.code} {order.customer?.name}
        </p>
        <p className="text-sm text-gray-600">状态：{zh(order.status)}</p>
        <p className="text-sm text-gray-600">
          订单金额：{formatMoneyCents(order.productValueCents + order.shippingFeeCents, order.currency)} | COD 应收：{" "}
          {formatMoneyCents(order.codAmountCents, order.currency)}
        </p>
        <p className="text-sm text-gray-600">创建人：{order.creatorUser?.fullName ?? order.creatorUser?.username}</p>
        <p className="text-sm text-gray-600">创建时间：{format(order.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">订单商品</h2>
          <ul className="space-y-2 text-sm">
            {order.items.length === 0 ? (
              <li className="text-gray-500">暂无商品。</li>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">收件与物流信息</h2>
          <dl className="grid grid-cols-[7rem_1fr] gap-2 text-sm text-gray-700">
            <dt className="text-gray-500">订单模板</dt><dd>{order.orderTemplate?.name ?? "未使用模板"}</dd>
            <dt className="text-gray-500">物流渠道</dt><dd>{order.logisticsChannel || "-"}</dd>
            <dt className="text-gray-500">收件人</dt><dd>{order.recipientName || "-"}</dd>
            <dt className="text-gray-500">联系电话</dt><dd>{order.recipientPhone || "-"}</dd>
            <dt className="text-gray-500">国家 / 邮编</dt><dd>{[order.recipientCountryCode, order.recipientPostalCode].filter(Boolean).join(" / ") || "-"}</dd>
            <dt className="text-gray-500">地区 / 城市</dt><dd>{[order.recipientRegion, order.recipientCity].filter(Boolean).join(" / ") || "-"}</dd>
            <dt className="text-gray-500">详细地址</dt><dd>{order.recipientAddress || "-"}</dd>
            <dt className="text-gray-500">包裹重量</dt><dd>{order.packageWeightGrams == null ? "-" : `${(order.packageWeightGrams / 1000).toFixed(3)} kg`}</dd>
          </dl>
        </section>
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">收款与联系信息</h2>
          <dl className="grid grid-cols-[7rem_1fr] gap-2 text-sm text-gray-700">
            <dt className="text-gray-500">付款方式</dt><dd>{order.paymentMethod || "-"}</dd>
            <dt className="text-gray-500">COD 应收</dt><dd>{formatMoneyCents(order.codAmountCents, order.currency)}</dd>
            <dt className="text-gray-500">运费</dt><dd>{formatMoneyCents(order.shippingFeeCents, order.currency)}</dd>
            <dt className="text-gray-500">客户 WhatsApp</dt><dd>{order.customerWhatsapp || "-"}</dd>
            <dt className="text-gray-500">员工 WhatsApp</dt><dd>{order.staffWhatsapp || "-"}</dd>
            <dt className="text-gray-500">订单日期</dt><dd>{format(order.orderedAt, "yyyy-MM-dd")}</dd>
          </dl>
        </section>
      </div>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">备注</h2>
        <p className="text-sm text-gray-600">订单备注：{order.note || "-"}</p>
        <p className="text-sm text-gray-600">异常备注：{order.exceptionNote || "-"}</p>
      </section>
    </div>
  );
}
