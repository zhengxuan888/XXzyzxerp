import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { format } from "date-fns";

import OrderWorkflowActions from "@/components/admin/OrderWorkflowActions";
import OrderReviewClaimButton from "@/components/admin/OrderReviewClaimButton";
import AttachmentPanel from "@/components/admin/AttachmentPanel";
import { formatMoneyCents } from "@/lib/money";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { assertOrderReadScope } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { zh } from "@/lib/i18n";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) {
    redirect("/login");
  }

  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const order = await prisma.order.findFirst({
    where: {
      id,
      businessUnitId: membership.businessUnitId,
    },
    include: {
      customer: { select: { code: true, name: true } },
      creatorUser: { select: { username: true, fullName: true } },
      orderTemplate: { select: { code: true, name: true, configuration: true } },
      items: { include: { product: { select: { code: true, name: true } } } },
      shipments: { include: { events: true } },
      reviewClaimedBy: { include: { user: { select: { fullName: true, username: true } } } },
    },
  });
  if (!order) notFound();

  const allowed = await assertOrderReadScope({ membership, userId: session.userId, orderId: order.id });
  if (!allowed) redirect("/admin");

  const [canSubmit, canReview, canReviewProof, canShip, canCancel, canReadAttachments, canCreateAttachments, canDeleteAttachments] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.submit",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.review",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.review.proof.upload",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: order.departmentId,
      targetSiteId: order.siteId,
      targetUserId: order.creatorUserId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.ship",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "order.status.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attachment.read",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: order.departmentId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attachment.create",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: order.departmentId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "attachment.delete",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: order.departmentId,
    }),
  ]);

  const shipmentPermissions = new Map(
    await Promise.all(order.shipments.map(async (shipment) => {
      const target = {
        userId: session.userId,
        membershipId: membership.id,
        targetBusinessUnitId: membership.businessUnitId,
        targetDepartmentId: order.departmentId,
        targetSiteId: shipment.siteId,
        targetUserId: order.creatorUserId,
      };
      const [trackingNo, timeline] = await Promise.all([
        checkPermission({ ...target, actionKey: "shipment.tracking_no.view" }),
        checkPermission({ ...target, actionKey: "shipment.timeline.view" }),
      ]);
      return [shipment.id, { trackingNo: trackingNo.allowed, timeline: timeline.allowed }] as const;
    })),
  );
  const templateConfiguration = parseOrderTemplateConfiguration(order.orderTemplate?.configuration);

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
        <p className="text-sm text-gray-600">
          状态：{zh(order.status)}
        </p>
        <p className="text-sm text-gray-600">
          订单金额：{formatMoneyCents(order.productValueCents + order.shippingFeeCents, order.currency)} | COD应收：
          {formatMoneyCents(order.codAmountCents, order.currency)}
        </p>
        <p className="text-sm text-gray-600">创建人：{order.creatorUser?.fullName ?? order.creatorUser?.username}</p>
        <p className="text-sm text-gray-600">创建时间：{format(order.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">订单明细</h2>
          <ul className="space-y-2 text-sm">
            {order.items.length === 0 ? (
              <li className="text-gray-500">暂无商品</li>
            ) : (
              order.items.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>
                    {item.productName} x {item.quantity} {item.product?.code}
                  </span>
                  <span className="text-gray-500">{formatMoneyCents(item.subtotalCents, order.currency)}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        {order.status === "SUBMITTED" && canReview.allowed && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <OrderReviewClaimButton
              orderId={order.id}
              claimedByMe={order.reviewClaimedByMembershipId === membership.id}
              claimedByName={order.reviewClaimedBy?.user.fullName ?? order.reviewClaimedBy?.user.username}
            />
          </div>
        )}
        <OrderWorkflowActions
          orderId={order.id}
          currentStatus={order.status}
          permissions={{
            submit: canSubmit.allowed,
            review: canReview.allowed,
            ship: canShip.allowed,
            cancel: canCancel.allowed,
          }}
          reviewClaimedByMe={order.reviewClaimedByMembershipId === membership.id}
          reviewRejectReasons={templateConfiguration.reviewRejectReasons}
          voidReasons={templateConfiguration.voidReasons}
        />
      </div>

      {canReadAttachments.allowed && (
        <AttachmentPanel
          targetType="ORDER"
          targetId={order.id}
          canUpload={canCreateAttachments.allowed && order.status === "DRAFT"}
          canDelete={canDeleteAttachments.allowed && order.status === "DRAFT"}
          title="客户沟通凭证（提交核单前必传）"
        />
      )}

      {canReadAttachments.allowed && canReview.allowed && canReviewProof.allowed && order.status === "SUBMITTED" && (
        <AttachmentPanel
          targetType="ORDER_REVIEW"
          targetId={order.id}
          canUpload={order.reviewClaimedByMembershipId === membership.id}
          canDelete={canDeleteAttachments.allowed}
          title="核单凭证（审核通过前必传，由当前审核人员上传）"
        />
      )}

      {canReadAttachments.allowed && order.status === "WAITING_SHIPMENT" && order.shipments.filter((shipment) => shipment.status === "PENDING").map((shipment) => (
        <AttachmentPanel
          key={shipment.id}
          targetType="SHIPMENT"
          targetId={shipment.id}
          canUpload={canCreateAttachments.allowed && canShip.allowed}
          canDelete={canDeleteAttachments.allowed && canShip.allowed}
          title={`出货凭证 · ${shipment.carrier || "待填写物流商"} · ${shipmentPermissions.get(shipment.id)?.trackingNo ? shipment.trackingNo || "待回填运单号" : "物流单号受限"}`}
        />
      ))}

      <section className="rounded border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">物流信息</h2>
        {order.shipments.length === 0 ? (
          <p className="text-sm text-gray-600">暂无物流信息</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {order.shipments.map((shipment) => (
              <li
                key={shipment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 p-3"
              >
                <span>
                  {shipment.carrier || "未设置承运商"} / {shipmentPermissions.get(shipment.id)?.trackingNo ? shipment.trackingNo || "-" : "物流单号受限"}
                </span>
                <span>{zh(shipment.status)}</span>
                {shipmentPermissions.get(shipment.id)?.timeline && (
                  <Link className="text-blue-700 hover:underline" href={`/admin/shipments/${shipment.id}`}>
                    查看物流
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
