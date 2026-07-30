import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, MapPin, PackageCheck, Route, Truck } from "lucide-react";
import type { ReactNode } from "react";

import ShipmentEventForm from "@/components/admin/ShipmentEventForm";
import LogisticsFollowUpForm from "@/components/admin/LogisticsFollowUpForm";
import AttachmentPanel from "@/components/admin/AttachmentPanel";
import ShipmentSyncButton from "@/components/admin/ShipmentSyncButton";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { zh } from "@/lib/i18n";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const shipmentTarget = await prisma.shipment.findFirst({
    where: { id, businessUnitId: membership.businessUnitId },
    select: {
      businessUnitId: true,
      siteId: true,
      order: { select: { departmentId: true, creatorUserId: true } },
    },
  });
  if (!shipmentTarget) notFound();

  const permissionTarget = {
    userId: session.userId,
    membershipId: membership.id,
    targetBusinessUnitId: shipmentTarget.businessUnitId,
    targetDepartmentId: shipmentTarget.order.departmentId,
    targetSiteId: shipmentTarget.siteId,
    targetUserId: shipmentTarget.order.creatorUserId,
  };
  const [canRead, canViewTrackingNo, canViewTimeline, canTrack, canReadAttachments, canUpload, canDeleteAttachments] =
    await Promise.all([
      checkPermission({ ...permissionTarget, actionKey: "shipment.read" }),
      checkPermission({ ...permissionTarget, actionKey: "shipment.tracking_no.view" }),
      checkPermission({ ...permissionTarget, actionKey: "shipment.timeline.view" }),
      checkPermission({ ...permissionTarget, actionKey: "shipment.track.update" }),
      checkPermission({ ...permissionTarget, actionKey: "attachment.read" }),
      checkPermission({ ...permissionTarget, actionKey: "attachment.create" }),
      checkPermission({ ...permissionTarget, actionKey: "attachment.delete" }),
    ]);
  if (!canRead.allowed) redirect("/admin");

  const shipment = await prisma.shipment.findFirst({
    where: {
      id,
      businessUnitId: membership.businessUnitId,
    },
    include: {
      order: { select: { orderNo: true } },
      events: {
        where: canViewTimeline.allowed ? {} : { id: "__permission_denied__" },
        orderBy: { occurredAt: "desc" },
      },
      followUps: {
        where: canViewTimeline.allowed ? {} : { id: "__permission_denied__" },
        orderBy: { createdAt: "desc" },
        include: { actorUser: { select: { fullName: true, username: true } },
        },
      },
    },
  });
  if (!shipment) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/shipments" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-violet-700">
        <ArrowLeft size={16} /> 返回物流跟踪
      </Link>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">物流订单</span>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{zh(shipment.status)}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{zh(shipment.workStatus)}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              {canViewTrackingNo.allowed ? shipment.trackingNo || "未设置物流单号" : "物流单号受限"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">关联订单 {shipment.order.orderNo}</p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[420px]">
            <Info icon={<Truck size={16} />} label="承运商" value={shipment.carrier || "-"} />
            <Info icon={<Route size={16} />} label="轨迹数量" value={`${shipment.events.length} 条`} />
            <Info icon={<PackageCheck size={16} />} label="跟进记录" value={`${shipment.followUps.length} 条`} />
            <Info icon={<CalendarClock size={16} />} label="下次跟进" value={shipment.nextFollowUpAt ? new Date(shipment.nextFollowUpAt).toLocaleString("zh-CN") : "未安排"} />
          </div>
          {canTrack.allowed && canViewTrackingNo.allowed && <ShipmentSyncButton shipmentId={shipment.id} />}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">物流轨迹</h2>
          <p className="mt-1 text-xs text-slate-500">按时间顺序展示每条物流事件，支持人工补录与后续处理。</p>
          <ul className="relative mt-5 space-y-0 text-sm text-slate-700">
            {shipment.events.length === 0 ? (
              <li className="rounded-xl bg-slate-50 p-4 text-slate-500">暂无物流轨迹</li>
            ) : (
              shipment.events.map((item) => (
                <li key={item.id} className="relative ml-3 border-l border-slate-200 pb-5 pl-6 last:border-transparent last:pb-0">
                  <span className="absolute -left-2 top-0 grid size-4 place-items-center rounded-full bg-violet-100 ring-4 ring-white">
                    <span className="size-1.5 rounded-full bg-violet-600" />
                  </span>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{zh(item.eventType)}</p>
                      <time className="text-xs text-slate-400">{new Date(item.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <p className="mt-1 text-slate-600">{item.memo || "无说明"}</p>
                    {item.location && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} />{item.location}</p>}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
        {canTrack.allowed && canViewTimeline.allowed ? (
          <ShipmentEventForm shipmentId={shipment.id} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            当前岗位未配置物流轨迹维护权限。
          </div>
        )}
      </section>

      {canReadAttachments.allowed && (
        <AttachmentPanel
          targetType="SHIPMENT"
          targetId={shipment.id}
          canUpload={canUpload.allowed}
          canDelete={canDeleteAttachments.allowed}
          title="出货凭证与资料"
        />
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">跟进记录</h2>
          <p className="mt-1 text-xs text-slate-500">用于记录异常处理、等待客户反馈与下一步动作。</p>
          {shipment.followUps.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无跟进记录。</p>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {shipment.followUps.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">{zh(item.toStatus || "")}</span>
                    <time className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</time>
                  </div>
                  <p className="leading-6 text-slate-700">{item.note || "-"}</p>
                  <p className="mt-2 text-xs text-slate-500">记录人：{item.actorUser.fullName || item.actorUser.username}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {canTrack.allowed && canViewTimeline.allowed ? (
          <LogisticsFollowUpForm shipmentId={shipment.id} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            当前岗位未配置售后跟进记录权限。
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-violet-600 shadow-sm">{icon}</span>
      <span className="min-w-0">
        <small className="block text-[11px] text-slate-400">{label}</small>
        <strong className="block truncate text-xs font-semibold text-slate-700">{value}</strong>
      </span>
    </div>
  );
}
