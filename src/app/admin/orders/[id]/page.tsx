import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { format } from "date-fns";
import type { Prisma } from "@prisma/client";

import OrderWorkflowActions from "@/components/admin/OrderWorkflowActions";
import DraftOrderEditForm from "@/components/admin/DraftOrderEditForm";
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
      items: { include: { product: { select: { code: true, name: true } }, sku: { select: { id: true, code: true } } } },
      shipments: { include: { events: true } },
      reviewClaimedBy: { include: { user: { select: { fullName: true, username: true } } } },
    },
  });
  if (!order) notFound();

  const allowed = await assertOrderReadScope({ membership, orderId: order.id });
  if (!allowed) redirect("/admin");

  const permissionTarget = {
    userId: session.userId,
    membershipId: membership.id,
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
    targetMembershipId: order.ownedByMembershipId,
  };
  const [canSubmit, canUpdate, canReview, canReviewApprove, canReviewReject, canShip, canCancel, canReadAttachments, canCreateAttachments, canDeleteAttachments] = await Promise.all([
    checkPermission({
      ...permissionTarget,
      actionKey: "order.submit",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.update",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.review",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.review.approve",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.review.reject",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.ship",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "order.void",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "attachment.read",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "attachment.create",
    }),
    checkPermission({
      ...permissionTarget,
      actionKey: "attachment.delete",
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
        targetMembershipId: order.ownedByMembershipId,
      };
      const [trackingNo, timeline] = await Promise.all([
        checkPermission({ ...target, actionKey: "shipment.tracking_no.view" }),
        checkPermission({ ...target, actionKey: "shipment.timeline.view" }),
      ]);
      return [shipment.id, { trackingNo: trackingNo.allowed, timeline: timeline.allowed }] as const;
    })),
  );
  const templateConfiguration = parseOrderTemplateConfiguration(order.orderTemplate?.configuration);
  const [editableProducts, countries] = order.status === "DRAFT" && canUpdate.allowed ? await Promise.all([
    prisma.product.findMany({ where: { businessUnitId: order.businessUnitId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, skus: { where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true } } } }),
    prisma.country.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { code: true, name: true } }),
  ]) : [[], []];
  const contactMatches = ([
    order.recipientEmail ? { recipientEmail: { equals: order.recipientEmail, mode: "insensitive" as const } } : null,
    order.recipientPhone ? { recipientPhone: order.recipientPhone } : null,
    order.customerWhatsapp ? { customerWhatsapp: order.customerWhatsapp } : null,
  ] as Array<Prisma.OrderWhereInput | null>).filter((item): item is Prisma.OrderWhereInput => Boolean(item));
  const comparisonScope: Prisma.OrderWhereInput = {
    businessUnitId: order.businessUnitId,
    departmentId: order.departmentId,
    ...(canReview.allowed ? {} : { creatorUserId: session.userId }),
    id: { not: order.id },
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  const [previousOrderCount, duplicateContactCount] = await Promise.all([
    prisma.order.count({ where: { ...comparisonScope, customerId: order.customerId } }),
    contactMatches.length ? prisma.order.count({ where: { ...comparisonScope, OR: contactMatches } }) : Promise.resolve(0),
  ]);
  const pendingShipment = order.shipments.find((shipment) => shipment.status === "PENDING");
  const shipmentProofCount = pendingShipment
    ? await prisma.attachment.count({
        where: {
          businessUnitId: order.businessUnitId,
          targetType: "SHIPMENT",
          targetId: pendingShipment.id,
          status: "ACTIVE",
        },
      })
    : 0;
  const missingFields = [
    !order.shopId && "比特窗口号（店铺 ID）",
    !order.recipientName && "收件人",
    !order.recipientPhone && "电话",
    !order.recipientEmail && "邮箱",
    !order.recipientCountryCode && "国家",
    !order.recipientPostalCode && "邮编",
    !order.recipientCity && "城市",
    !order.recipientAddress && "详细地址",
  ].filter(Boolean) as string[];

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
          申报金额：{formatMoneyCents(order.productValueCents, order.declarationCurrency)} | COD应收：
          {formatMoneyCents(order.codAmountCents, order.currency)}
        </p>
        <p className="text-sm text-gray-600">创建人：{order.creatorUser?.fullName ?? order.creatorUser?.username}</p>
        <p className="text-sm text-gray-600">创建时间：{format(order.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">核单信息总览</h2>
            <p className="mt-1 text-xs text-slate-500">客户、联系方式和收货地址集中核对，无需切换页面。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {previousOrderCount > 0 && <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700">历史下单 {previousOrderCount} 次</span>}
            {duplicateContactCount > 0 && <span className="rounded-full bg-rose-100 px-3 py-1.5 text-rose-700">疑似重复订单 {duplicateContactCount} 条</span>}
            {missingFields.length === 0
              ? <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">必要信息完整</span>
              : <span className="rounded-full bg-rose-100 px-3 py-1.5 text-rose-700">缺少：{missingFields.join("、")}</span>}
          </div>
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["比特窗口号（店铺 ID）", order.shopId],
            ["收件人", order.recipientName],
            ["销售", order.creatorUser?.fullName ?? order.creatorUser?.username],
            ["电话", order.recipientPhone],
            ["WhatsApp", order.customerWhatsapp],
            ["邮箱", order.recipientEmail],
            ["国家/地区", order.recipientCountryCode],
            ["州/区域", order.recipientRegion],
            ["城市", order.recipientCity],
            ["邮编", order.recipientPostalCode],
            ["付款方式", order.paymentMethod],
            ["物流渠道", order.logisticsChannel],
            ["订单模板", order.orderTemplate?.name],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className={`mt-1 break-words font-medium ${value ? "text-slate-900" : "text-rose-600"}`}>{value || "未填写"}</dd>
            </div>
          ))}
          <div className="sm:col-span-2 xl:col-span-4">
            <dt className="text-xs font-semibold text-slate-500">完整地址</dt>
            <dd className={`mt-1 break-words font-medium ${order.recipientAddress ? "text-slate-900" : "text-rose-600"}`}>
              {order.recipientAddress || "未填写"}
            </dd>
          </div>
          {order.note && (
            <div className="sm:col-span-2 xl:col-span-4">
              <dt className="text-xs font-semibold text-slate-500">订单备注</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words font-medium text-slate-900">{order.note}</dd>
            </div>
          )}
        </dl>
      </section>

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

        {order.status !== "SUBMITTED" && <OrderWorkflowActions
          orderId={order.id}
          currentStatus={order.status}
          permissions={{
            submit: canSubmit.allowed,
            reviewApprove: canReviewApprove.allowed,
            reviewReject: canReviewReject.allowed,
            ship: canShip.allowed,
            cancel: canCancel.allowed,
          }}
          reviewRejectReasons={templateConfiguration.reviewRejectReasons}
          voidReasons={templateConfiguration.voidReasons}
          shippingChecklist={{
            hasShipment: Boolean(pendingShipment),
            hasTrackingNo: Boolean(pendingShipment?.trackingNo),
            hasProof: shipmentProofCount > 0,
          }}
        />}
      </div>

      {order.status === "DRAFT" && canUpdate.allowed && order.exceptionNote && order.items[0] && (
        <DraftOrderEditForm
          products={editableProducts}
          countries={countries}
          order={{
            id: order.id, shopId: order.shopId ?? "", productId: order.items[0].productId ?? "", skuId: order.items[0].sku?.id ?? "",
            productName: order.items[0].productName, quantity: order.items[0].quantity, unitPriceCents: order.items[0].unitPriceCents,
            codAmountCents: order.codAmountCents, shippingFeeCents: order.shippingFeeCents, currency: order.currency,
            orderedAt: format(order.orderedAt, "yyyy-MM-dd"), recipientName: order.recipientName ?? "", recipientPhone: order.recipientPhone ?? "",
            recipientEmail: order.recipientEmail ?? "", recipientCountryCode: order.recipientCountryCode ?? "", recipientPostalCode: order.recipientPostalCode ?? "",
            recipientRegion: order.recipientRegion ?? "", recipientCity: order.recipientCity ?? "", recipientAddress: order.recipientAddress ?? "",
            customerWhatsapp: order.customerWhatsapp ?? "", staffWhatsapp: order.staffWhatsapp ?? "", packageWeightGrams: order.packageWeightGrams ?? 0,
            paymentMethod: order.paymentMethod ?? "COD", logisticsChannel: order.logisticsChannel ?? "", note: order.note ?? "", returnReason: order.exceptionNote,
          }}
        />
      )}

      {canReadAttachments.allowed && (
        <AttachmentPanel
          targetType="ORDER"
          targetId={order.id}
          canUpload={canCreateAttachments.allowed && order.status === "DRAFT"}
          canDelete={canDeleteAttachments.allowed && order.status === "DRAFT"}
          title="客户沟通凭证（提交核单前必传）"
        />
      )}

      {canReview.allowed && order.status === "SUBMITTED" && (
        <OrderWorkflowActions
          orderId={order.id}
          currentStatus={order.status}
          permissions={{
            submit: canSubmit.allowed,
            reviewApprove: canReviewApprove.allowed,
            reviewReject: canReviewReject.allowed,
            ship: canShip.allowed,
            cancel: canCancel.allowed,
          }}
          reviewRejectReasons={templateConfiguration.reviewRejectReasons}
          voidReasons={templateConfiguration.voidReasons}
        />
      )}

      {canReadAttachments.allowed && order.status === "WAITING_SHIPMENT" && order.shipments.filter((shipment) => shipment.status === "PENDING").map((shipment) => (
        <div key={shipment.id} id="shipment-proof" className="scroll-mt-24">
        <AttachmentPanel
          targetType="SHIPMENT"
          targetId={shipment.id}
          canUpload={canCreateAttachments.allowed && canShip.allowed && Boolean(shipment.trackingNo)}
          canDelete={canDeleteAttachments.allowed && canShip.allowed && Boolean(shipment.trackingNo)}
          refreshAfterUpload
          title={`发货凭证 · ${shipment.carrier || "待填写物流商"} · ${shipmentPermissions.get(shipment.id)?.trackingNo ? shipment.trackingNo || "待回填运单号" : "物流单号受限"}`}
        />
        </div>
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
