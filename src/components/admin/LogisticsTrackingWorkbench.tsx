"use client";

import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Mail, MessageCircle, Package, Save, Search, Truck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LogisticsQueueKey, LogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";
import { translateTrackingDescription } from "@/lib/tracking-translation";

type Annotation = { note: string | null; tags: string[]; isHandled: boolean; handledAt: string | null; updatedAt: string; handledByMembership?: { user?: { fullName: string | null; username: string } } | null };
type TrackingEvent = { id: string; occurredAt: string; eventType: string; statusMilestone: string | null; location: string | null; memo: string | null; memoTranslation: string | null; annotation: Annotation | null };
type TrackingRow = { id: string; updatedAt: string; trackingNo: string | null; carrier: string | null; status: string; urgency: "critical" | "high" | "normal"; urgencyLabel: string; priorityTag: string; dueStatus: string; canViewTrackingNo: boolean; canViewTimeline: boolean; canAnnotate: boolean; eventTotal: number; unhandledEventCount: number; queueSignals: string[]; followUpOwner: { id: string; user: { username: string; fullName: string | null } } | null; order: { id: string; orderNo: string; status: string; exceptionNote: string | null; shopId: string | null; recipientName: string | null; recipientPhone: string | null; recipientEmail: string | null; customerWhatsapp: string | null; recipientCountryCode: string | null; codAmountLabel: string; customer: { name: string }; creatorUser: { username: string; fullName: string | null }; ownerMembership: { id: string; department: { id: string; name: string } | null; managerMembership: { id: string; user: { username: string; fullName: string | null } } | null }; items: Array<{ productName: string; quantity: number }> }; events: TrackingEvent[] };

const trackingStatusLabels: Record<string, string> = {
  UNKNOWN: "状态待确认",
  INFO_RECEIVED: "物流信息已收到",
  PENDING: "等待承运商处理",
  PICKED_UP: "物流商已揽收",
  IN_TRANSIT: "运输途中",
  ARRIVED_AT_DESTINATION: "已到达目的地",
  CUSTOMS: "清关处理中",
  CUSTOMS_CLEARED: "清关完成",
  OUT_FOR_DELIVERY: "派送中",
  AVAILABLE_FOR_PICKUP: "到达待取",
  DELIVERY_ATTEMPTED: "派送未成功",
  DELIVERED: "已签收",
  EXCEPTION: "物流异常",
  ADDRESS_ERROR: "地址异常",
  REFUSED: "客户拒收",
  RETURNING: "退回途中",
  RETURNED: "已退回",
};

function trackingStatusLabel(value: string | null | undefined) {
  if (!value) return "状态待确认";
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return trackingStatusLabels[key] ?? value;
}

function trackingMemoLabel(value: string | null, statusMilestone: string | null, eventType: string) {
  const verifiedTranslation = translateTrackingDescription(value);
  if (verifiedTranslation) return verifiedTranslation;
  if (value) return "该承运商原文暂未提供可靠中文翻译，请人工核对";
  const normalizedStatus = (statusMilestone || eventType).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const normalizedLabels: Record<string, string> = {
    INFO_RECEIVED: "物流商已收到电子信息，尚不代表已揽收",
    PENDING: "暂未获得有效物流轨迹",
    PICKED_UP: "物流商已揽收快件",
    IN_TRANSIT: "快件正在运输途中",
    ARRIVED_AT_DESTINATION: "快件已到达目的国家或地区",
    CUSTOMS: "快件正在办理清关",
    CUSTOMS_CLEARED: "快件已完成清关",
    OUT_FOR_DELIVERY: "快件正在派送，通常会在当天尝试送达",
    FAILED_ATTEMPT: "本次派送未成功，需查看原文确认原因",
    DELIVERY_ATTEMPTED: "本次派送未成功，需查看原文确认原因",
    AVAILABLE_FOR_PICKUP: "快件已到达取件点，等待客户领取",
    READY_FOR_PICKUP: "快件已到达取件点，等待客户领取",
    DELIVERED: "物流商显示已送达，仍需人工确认客户实际签收",
    EXCEPTION: "物流出现异常，需查看原文并人工跟进",
    ADDRESS_ERROR: "收件地址存在异常，需联系客户核对",
    CUSTOMER_ABSENT: "派送时客户不在，需联系客户跟进",
    REFUSED: "物流商显示客户拒收，需人工核对",
    RETURNING: "快件正在退回途中",
    RETURNED: "快件已退回寄件方",
  };
  if (normalizedLabels[normalizedStatus]) return normalizedLabels[normalizedStatus];
  if (!value) return "暂无轨迹说明，请人工核对";
  const rules: Array<[RegExp, string]> = [
    [/\bem entrega\b|\bsaiu para entrega\b|\bser[aá] entregue durante o dia\b/i, "快件正在派送，预计当天送达"],
    [/\ben reparto\b|\bem distribuição\b|\bu dostavi\b/i, "快件正在派送，请留意电话并准备签收"],
    [/\benviado\b|\bexpedido\b|\bposlano\b/i, "快件已发出，正在运输途中"],
    [/\bentregado\b|\bentregue\b|\bisporučeno\b/i, "快件已成功签收"],
    [/\ben tránsito\b|\bem trânsito\b|\bu tranzitu\b/i, "快件正在运输途中"],
    [/\bintento de entrega\b|\btentativa de entrega\b/i, "物流商已尝试派送，但本次未成功"],
    [/\bdevuelto\b|\bdevolvido\b|\bvraćeno\b/i, "快件正在退回或已退回寄件方"],
    [/out for delivery/i, "快件正在派送，请留意电话并准备签收"],
    [/delivered|successfully delivered/i, "快件已成功签收"],
    [/available for pick.?up|ready for pick.?up/i, "快件已到达取件点，等待客户领取"],
    [/delivery attempt|attempted delivery/i, "物流商已尝试派送，但本次未成功"],
    [/address.*(incorrect|invalid|incomplete)|incorrect address/i, "收件地址有误或信息不完整"],
    [/customs.*clear|cleared customs/i, "快件已完成清关"],
    [/customs/i, "快件正在办理清关"],
    [/arrived.*destination|destination country/i, "快件已到达目的地国家或地区"],
    [/departed.*facilit|departed.*sort/i, "快件已离开分拨中心，继续运输"],
    [/arrived.*facilit|arrived.*sort/i, "快件已到达分拨中心"],
    [/in transit|transport|on the way/i, "快件正在运输途中"],
    [/picked up|collected by carrier|accepted by carrier/i, "物流商已揽收快件"],
    [/shipment.*information.*received|label created|electronic information/i, "物流商已收到运单信息，等待揽收"],
    [/refused/i, "客户拒收快件"],
    [/return.*sender|returned/i, "快件正在退回或已退回寄件方"],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? "该承运商原文暂未可靠翻译，请人工核对";
}

export default function LogisticsTrackingWorkbench({
  rows,
  config,
  canViewTrackingNo,
  canViewTimeline,
  canAnnotate,
  currentMembershipId,
  canReassign,
  pagination,
  queueCounts,
  filterOptions,
}: {
  rows: TrackingRow[];
  config: LogisticsWorkbenchConfig;
  canViewTrackingNo: boolean;
  canViewTimeline: boolean;
  canAnnotate: boolean;
  currentMembershipId: string;
  canReassign: boolean;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  queueCounts: Partial<Record<LogisticsQueueKey, number>>;
  filterOptions: {
    departments: Array<{ id: string; name: string }>;
    managers: Array<{ id: string; name: string; departmentId: string | null }>;
    creators: Array<{ id: string; name: string; departmentId: string | null; managerMembershipId: string | null }>;
    statuses: string[];
    carriers: string[];
    destinations: string[];
  };
}) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const [keyword, setKeyword] = useState(urlSearchParams.get("q") ?? "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmingDeliveredId, setConfirmingDeliveredId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<Record<string, string>>({});
  const queue = (urlSearchParams.get("queue") ?? "unhandled") as LogisticsQueueKey;
  const departmentId = urlSearchParams.get("departmentId") ?? "";
  const managerMembershipId = urlSearchParams.get("managerMembershipId") ?? "";
  const creatorMembershipId = urlSearchParams.get("creatorMembershipId") ?? "";
  const shipmentStatus = urlSearchParams.get("status") ?? "";
  const carrier = urlSearchParams.get("carrier") ?? "";
  const destination = urlSearchParams.get("destination") ?? "";
  const ownerQueue = (urlSearchParams.get("owner") ?? "mine") as "all" | "mine" | "unassigned";
  const [claimedOwners, setClaimedOwners] = useState<Record<string, string>>({});
  const confirmDelivered = async (row: TrackingRow) => {
    if (!window.confirm(`第一次确认：订单 ${row.order.orderNo} 的客户确实已经收到货？`)) return;
    if (!window.confirm("第二次确认：将该订单标记为“成功签收”并结束物流跟进。确认继续？")) return;
    setConfirmingDeliveredId(row.id);
    setDeliveryMessage((current) => ({ ...current, [row.id]: "" }));
    const response = await fetch(`/api/mvp/shipments/${row.id}/confirm-delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setConfirmingDeliveredId(null);
    if (!response.ok) {
      setDeliveryMessage((current) => ({ ...current, [row.id]: payload?.error?.message ?? "确认签收失败" }));
      return;
    }
    setDeliveryMessage((current) => ({ ...current, [row.id]: "已人工确认成功签收" }));
    router.refresh();
  };
  const markAfterDeliveryRefund = async (row: TrackingRow) => {
    if (!window.confirm(`第一次确认：订单 ${row.order.orderNo} 已签收后发生退款？`)) return;
    if (!window.confirm("第二次确认：订单结果将改为“签收后退款”并进入已完成。确认继续？")) return;
    setRefundingId(row.id);
    const response = await fetch(`/api/mvp/shipments/${row.id}/after-delivery-refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setRefundingId(null);
    if (!response.ok) {
      setDeliveryMessage((current) => ({ ...current, [row.id]: payload?.error?.message ?? "登记退款失败" }));
      return;
    }
    setDeliveryMessage((current) => ({ ...current, [row.id]: "已登记签收后退款" }));
    router.refresh();
  };
  const replaceQuery = (updates: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(urlSearchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete("page");
    router.replace(`/admin/shipments${next.size ? `?${next.toString()}` : ""}`);
  };
  const pagedRows = rows;
  const countFor = (key: LogisticsQueueKey) => queueCounts[key] ?? 0;
  const toneFor = (key: LogisticsQueueKey) => key === "critical" || key === "exception" || key === "signed_refund" ? "border-rose-200 bg-rose-50 text-rose-900" : key === "high" || key === "out_for_delivery" ? "border-amber-200 bg-amber-50 text-amber-900" : key === "normal" || key === "delivered" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : key === "unhandled" || key === "returning" ? "border-violet-200 bg-violet-50 text-violet-900" : key === "in_transit" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-900";
  const queueCards = config.cards.filter((card) => card.isVisible).map((card) => ({ ...card, count: countFor(card.key), tone: toneFor(card.key) }));
  const priorityFilters: Array<{ key: LogisticsQueueKey; label: string }> = [
    { key: "critical", label: "超期高风险" },
    { key: "problem", label: "物流异常" },
    { key: "pending_delivery_confirmation", label: "待人工确认签收" },
    { key: "due_today", label: "今日需要跟进" },
    { key: "out_for_delivery", label: "派送中" },
    { key: "normal", label: "普通运输" },
  ];
  const { departments, managers, creators, statuses: shipmentStatuses, carriers, destinations } = filterOptions;

  return <div className="space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-violet-700"><Truck size={20} /><span className="text-sm font-semibold">物流与售后</span></div><h1 className="mt-2 text-2xl font-bold text-slate-950">物流追踪工作台</h1><p className="mt-1 text-sm text-slate-500">集中查看客户、订单、产品与物流轨迹；每条轨迹都可以单独备注、打标签和标记处理完成。</p></div>
        <form onSubmit={(event) => { event.preventDefault(); replaceQuery({ q: keyword.trim() || null }); }} className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 lg:max-w-md"><Search size={17} className="text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={canViewTrackingNo ? "订单号、物流单号、客户、销售、产品" : "订单号、客户、销售、产品"} /><button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">搜索</button></form>
      </div>
    </header>
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6">
      <label className="grid gap-1 text-xs font-medium text-slate-500">部门<select value={departmentId} onChange={(event) => replaceQuery({ departmentId: event.target.value || null, managerMembershipId: null, creatorMembershipId: null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部部门</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">直属经理<select value={managerMembershipId} onChange={(event) => replaceQuery({ managerMembershipId: event.target.value || null, creatorMembershipId: null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部经理</option>{managers.filter((manager) => !departmentId || manager.departmentId === departmentId).map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">销售<select value={creatorMembershipId} onChange={(event) => replaceQuery({ creatorMembershipId: event.target.value || null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部销售</option>{creators.filter((creator) => (!departmentId || creator.departmentId === departmentId) && (!managerMembershipId || creator.managerMembershipId === managerMembershipId)).map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">物流状态<select value={shipmentStatus} onChange={(event) => replaceQuery({ status: event.target.value || null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部状态</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">物流商<select value={carrier} onChange={(event) => replaceQuery({ carrier: event.target.value || null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部物流商</option>{carriers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">目的地<select value={destination} onChange={(event) => replaceQuery({ destination: event.target.value || null })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部目的地</option>{destinations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {queueCards.map((card) => <button key={card.key} type="button" onClick={() => replaceQuery({ queue: card.key })} className={`rounded-2xl border p-4 text-left shadow-sm transition ${card.tone} ${queue === card.key ? "ring-2 ring-amber-500 ring-offset-2" : "hover:-translate-y-0.5"}`}><p className="text-xs font-medium opacity-70">{card.label}</p><p className="mt-1 text-2xl font-bold">{card.count}</p></button>)}
    </section>
    {!canViewTrackingNo && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流单号”权限，页面已隐藏物流单号。</p>}
    {!canViewTimeline && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流轨迹”权限，页面已隐藏全部轨迹。</p>}
    {canViewTimeline && !canAnnotate && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">当前角色可查看物流轨迹，但未配置“处理物流轨迹”权限，备注和完成按钮已隐藏。</p>}
    {canAnnotate && <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">跟进状态</span>
        {([["unhandled", "待跟进"], ["followed", "已跟进"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => replaceQuery({ queue: value })} className={`rounded-lg px-3 py-1.5 font-medium ${queue === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label} {countFor(value)}</button>)}
        <span className="ml-2 font-semibold text-slate-700">任务范围</span>
        {canReassign && <button type="button" onClick={() => replaceQuery({ owner: "all" })} className={`rounded-lg px-3 py-1.5 font-medium ${ownerQueue === "all" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>全部</button>}
        <button type="button" onClick={() => replaceQuery({ owner: "mine" })} className={`rounded-lg px-3 py-1.5 font-medium ${ownerQueue === "mine" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>我的待办</button>
        <button type="button" onClick={() => replaceQuery({ owner: "unassigned" })} className={`rounded-lg px-3 py-1.5 font-medium ${ownerQueue === "unassigned" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>未分配</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="font-semibold text-slate-700">优先筛选</span>
        {priorityFilters.map((filter) => <button key={filter.key} type="button" onClick={() => replaceQuery({ queue: filter.key })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${queue === filter.key ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{filter.label} {countFor(filter.key)}</button>)}
      </div>
    </div>}
    {pagedRows.map((row) => { const isOpen = expanded[row.id] ?? false; return <article key={row.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${row.urgency === "critical" ? "border-rose-300" : row.urgency === "high" ? "border-amber-300" : "border-slate-200"}`}>
      <div role={row.canViewTimeline ? "button" : undefined} tabIndex={row.canViewTimeline ? 0 : undefined} onClick={(event) => { if (!row.canViewTimeline || (event.target as HTMLElement).closest("a,button,input,select,textarea,label")) return; setExpanded((value) => ({ ...value, [row.id]: !isOpen })); }} onKeyDown={(event) => { if (!row.canViewTimeline || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); setExpanded((value) => ({ ...value, [row.id]: !isOpen })); }} className={`grid gap-4 p-4 xl:grid-cols-[1.2fr_1.3fr_1fr_auto] xl:items-center ${row.canViewTimeline ? "cursor-pointer hover:bg-slate-50/70" : ""}`}>
        <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.urgency === "critical" ? "bg-rose-50 text-rose-700" : row.urgency === "high" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}>{row.urgencyLabel}</span>{row.priorityTag !== "-" && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{row.priorityTag}</span>}</div><div className="mt-2 flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-semibold text-slate-900">{row.trackingNo || "暂无物流单号"}</p>{row.trackingNo && <a href={`https://www.ship24.com/tracking?p=${encodeURIComponent(row.trackingNo)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline">Ship24 查看<ExternalLink size={12} /></a>}</div><p className="mt-1 text-xs text-slate-500">{row.carrier || "未填写物流商"} · {row.order.recipientCountryCode || "目的地未知"} · {row.dueStatus}</p></div>
        <div><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/orders/${row.order.id}`} className="font-semibold text-violet-700 hover:underline">{row.order.orderNo}</Link><span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">窗口 ID：{row.order.shopId || "未填写"}</span></div><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-800"><MessageCircle size={14} className="text-emerald-600" />客户 WhatsApp：{row.order.customerWhatsapp || "未填写"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Mail size={13} />{row.order.recipientEmail || "-"}</span><span>{row.order.recipientPhone || "-"}</span></div></div>
        <div><div className="flex items-start gap-2"><Package size={16} className="mt-0.5 shrink-0 text-slate-400" /><div className="text-sm text-slate-700">{row.order.items.map((item) => `${item.productName} × ${item.quantity}`).join("、") || "未记录产品"}</div></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>COD：<strong className="text-slate-800">{row.order.codAmountLabel}</strong></span><span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700"><UserRound size={13} />销售：{row.order.creatorUser.fullName || row.order.creatorUser.username}</span></div></div>
        <div className="flex flex-col gap-2">
          {row.canAnnotate && <ClaimButton shipmentId={row.id} expectedUpdatedAt={row.updatedAt} currentMembershipId={currentMembershipId} ownerId={claimedOwners[row.id] ?? row.followUpOwner?.id ?? null} ownerName={claimedOwners[row.id] ? "我" : row.followUpOwner?.user.fullName || row.followUpOwner?.user.username || null} canReassign={canReassign} onClaimed={() => setClaimedOwners((current) => ({ ...current, [row.id]: currentMembershipId }))} />}
          {row.canAnnotate && row.status === "DELIVERED" && row.order.exceptionNote !== "人工确认成功签收" && row.order.exceptionNote !== "签收后退款" && <button type="button" disabled={confirmingDeliveredId === row.id} onClick={() => void confirmDelivered(row)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={16} />{confirmingDeliveredId === row.id ? "确认中…" : "人工确认签收"}</button>}
          {row.order.exceptionNote === "签收后退款" ? <span className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700">签收退款</span> : row.order.exceptionNote === "人工确认成功签收" ? <><span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">成功签收</span>{row.canAnnotate && <button type="button" disabled={refundingId === row.id} onClick={() => void markAfterDeliveryRefund(row)} className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{refundingId === row.id ? "登记中…" : "签收后退款"}</button>}</> : row.status === "DELIVERED" && <span className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">待人工确认签收</span>}
          {deliveryMessage[row.id] && <span className={`max-w-48 text-center text-xs ${deliveryMessage[row.id].startsWith("已") ? "text-emerald-700" : "text-rose-600"}`}>{deliveryMessage[row.id]}</span>}
          {row.canViewTimeline && <button type="button" onClick={() => setExpanded((value) => ({ ...value, [row.id]: !isOpen }))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{isOpen ? "收起轨迹" : `展开轨迹 ${row.eventTotal}`}</button>}
        </div>
      </div>
      {row.canViewTimeline && row.events.length > 0 && <TrackingEventsPanel shipmentId={row.id} initialEvents={row.events} initialTotal={row.eventTotal} expanded={isOpen} canAnnotate={row.canAnnotate} canSync={row.canAnnotate} quickTags={config.quickTags} />}
    </article>; })}
    {!rows.length && <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">没有找到匹配的物流订单。</div>}
    {pagination.total > 0 && <footer className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span>共 {pagination.total} 条</span><select value={pagination.pageSize} onChange={(event) => replaceQuery({ pageSize: event.target.value })} className="h-9 rounded-lg border border-slate-200 px-2"><option value={10}>10 / 页</option><option value={20}>20 / 页</option><option value={50}>50 / 页</option></select></div><div className="flex items-center gap-2"><span>第 {pagination.page}/{pagination.pageCount} 页</span><button type="button" disabled={pagination.page <= 1} onClick={() => replaceQuery({ page: String(pagination.page - 1) }, false)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40"><ChevronLeft size={15} />上一页</button><button type="button" disabled={pagination.page >= pagination.pageCount} onClick={() => replaceQuery({ page: String(pagination.page + 1) }, false)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40">下一页<ChevronRight size={15} /></button></div></footer>}
  </div>;
}

function ClaimButton({ shipmentId, expectedUpdatedAt, currentMembershipId, ownerId, ownerName, canReassign, onClaimed }: { shipmentId: string; expectedUpdatedAt: string; currentMembershipId: string; ownerId: string | null; ownerName: string | null; canReassign: boolean; onClaimed: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const isMine = ownerId === currentMembershipId;
  async function claim() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerMembershipId: currentMembershipId,
        workStatus: "IN_PROGRESS",
        note: "主动认领物流售后跟进任务",
        expectedUpdatedAt,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "认领失败");
      return;
    }
    onClaimed();
    setMessage("已认领");
  }
  if (isMine) return <span className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">我的待办</span>;
  if (ownerId && !canReassign) return <span className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-600">负责人：{ownerName}</span>;
  return <div className="grid gap-1">
    <button type="button" disabled={loading} onClick={() => void claim()} className="h-9 rounded-lg bg-violet-50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{loading ? "认领中…" : ownerId ? `转为我跟进（当前：${ownerName}）` : "认领跟进"}</button>
    {message && <span className="max-w-48 text-center text-xs text-rose-600">{message}</span>}
  </div>;
}

function TrackingEventsPanel({
  shipmentId,
  initialEvents,
  initialTotal,
  expanded,
  canAnnotate,
  canSync,
  quickTags,
}: {
  shipmentId: string;
  initialEvents: TrackingEvent[];
  initialTotal: number;
  expanded: boolean;
  canAnnotate: boolean;
  canSync: boolean;
  quickTags: string[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");
  const [batchTags, setBatchTags] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const syncAttempted = useRef(false);
  useEffect(() => {
    if (!expanded || syncAttempted.current) return;
    syncAttempted.current = true;
    let cancelled = false;
    async function loadAllEvents() {
      setLoading(true);
      setError("");
      if (canSync) {
        const syncResponse = await fetch(`/api/mvp/shipments/${shipmentId}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!syncResponse.ok && !cancelled) {
          const syncPayload = await syncResponse.json().catch(() => null) as { error?: { message?: string } } | null;
          setError(syncPayload?.error?.message ?? "Ship24 暂未返回可用轨迹");
        }
      }
      let page = 1;
      let expectedTotal = 1;
      const allEvents: TrackingEvent[] = [];
      while (allEvents.length < expectedTotal) {
        const response = await fetch(`/api/mvp/shipments/${shipmentId}/events?page=${page}&pageSize=100`);
        const payload = await response.json().catch(() => null) as { data?: TrackingEvent[]; meta?: { total: number }; error?: { message?: string } } | null;
        if (!response.ok) {
          if (!cancelled) setError(payload?.error?.message ?? "加载全部轨迹失败");
          break;
        }
        const incoming = payload?.data ?? [];
        expectedTotal = payload?.meta?.total ?? expectedTotal;
        allEvents.push(...incoming);
        if (!incoming.length) break;
        page += 1;
      }
      if (!cancelled && allEvents.length) {
        setEvents(allEvents);
        setTotal(expectedTotal);
      }
      if (!cancelled) setLoading(false);
    }
    void loadAllEvents();
    return () => { cancelled = true; };
  }, [canSync, expanded, shipmentId]);

  async function saveBatch() {
    if (!selected.length || !batchNote.trim()) {
      setBatchMessage(selected.length ? "请填写本次批量处理备注" : "请先勾选需要处理的轨迹");
      return;
    }
    setBatchSaving(true);
    setBatchMessage("");
    const response = await fetch("/api/mvp/shipments/events/annotations/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: selected.map((eventId) => {
          const event = events.find((item) => item.id === eventId);
          return { shipmentId, eventId, expectedUpdatedAt: event?.annotation?.updatedAt ?? null };
        }),
        note: batchNote,
        tags: batchTags.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean),
        isHandled: true,
      }),
    });
    const payload = await response.json().catch(() => null) as {
      data?: { updated: number; annotations: Array<Annotation & { shipmentEventId: string }> };
      error?: { message?: string };
    } | null;
    setBatchSaving(false);
    if (!response.ok) {
      setBatchMessage(payload?.error?.message ?? "批量处理失败");
      return;
    }
    const annotationByEvent = new Map((payload?.data?.annotations ?? []).map((item) => [item.shipmentEventId, item]));
    setEvents((current) => current.map((event) => ({
      ...event,
      annotation: annotationByEvent.get(event.id) ?? event.annotation,
    })));
    setBatchMessage(`已完成 ${payload?.data?.updated ?? selected.length} 条轨迹`);
    setSelected([]);
    setBatchNote("");
    setBatchTags("");
    router.refresh();
  }

  const visibleEvents = expanded ? events : events.slice(0, 1);
  return <div className="border-t border-slate-200 bg-slate-50/60 p-4">
    <div className="mb-2 text-xs font-medium text-slate-500">{expanded ? loading ? `正在加载全部 ${total} 条轨迹…` : `共 ${events.length} 条轨迹，轨迹区域可独立滚动` : "最新物流轨迹"}</div>
    {expanded && canAnnotate && <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-violet-900">
        <span>批量处理</span><span className="rounded-full bg-white px-2 py-0.5 text-xs">已选 {selected.length} 条</span>
        <button type="button" onClick={() => setSelected(visibleEvents.filter((event) => !event.annotation?.isHandled).map((event) => event.id))} className="text-xs text-violet-700 underline">选择当前未处理</button>
        <button type="button" onClick={() => setSelected([])} className="text-xs text-slate-500 underline">清空</button>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_0.7fr_auto]">
        <input value={batchNote} onChange={(event) => setBatchNote(event.target.value)} maxLength={1000} className="h-10 rounded-lg border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-400" placeholder="统一填写本次联系客户的结果（必填）" />
        <input value={batchTags} onChange={(event) => setBatchTags(event.target.value)} className="h-10 rounded-lg border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-400" placeholder="统一标签，如：已通知、等待回复" />
        <button type="button" disabled={batchSaving || !selected.length} onClick={() => void saveBatch()} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><CheckCircle2 size={15} />{batchSaving ? "处理中…" : "批量标记完成"}</button>
      </div>
      {batchMessage && <p className={`mt-2 text-xs ${batchMessage.startsWith("已完成") ? "text-emerald-700" : "text-rose-600"}`}>{batchMessage}</p>}
    </div>}
    <div className={`${expanded ? "max-h-[34rem] overflow-y-auto pr-1" : ""} space-y-3`}>
      {visibleEvents.map((event) => <EventEditor key={`${event.id}:${event.annotation?.handledAt ?? "open"}:${event.annotation?.note ?? ""}`} shipmentId={shipmentId} event={event} canAnnotate={canAnnotate} quickTags={quickTags} allowBatchSelection={expanded} selected={selected.includes(event.id)} onToggleSelection={() => setSelected((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} />)}
      {expanded && error && <p className="text-center text-xs text-rose-600">{error}</p>}
    </div>
  </div>;
}

function EventEditor({ shipmentId, event, canAnnotate, quickTags, allowBatchSelection, selected, onToggleSelection }: { shipmentId: string; event: TrackingEvent; canAnnotate: boolean; quickTags: string[]; allowBatchSelection: boolean; selected: boolean; onToggleSelection: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState(event.annotation?.note ?? "");
  const [tagsText, setTagsText] = useState((event.annotation?.tags ?? []).join("、"));
  const [isHandled, setIsHandled] = useState(event.annotation?.isHandled ?? false);
  const [handledAt, setHandledAt] = useState(event.annotation?.handledAt ?? null);
  const [handledBy, setHandledBy] = useState(event.annotation?.handledByMembership?.user ?? null);
  const eventLabel = trackingStatusLabel(event.eventType);
  const milestoneLabel = event.statusMilestone ? trackingStatusLabel(event.statusMilestone) : null;
  const [manualTranslation, setManualTranslation] = useState(event.memoTranslation ?? "");
  const [translationMessage, setTranslationMessage] = useState("");
  const memoLabel = manualTranslation || trackingMemoLabel(event.memo, event.statusMilestone, event.eventType);
  const [updatedAt, setUpdatedAt] = useState(event.annotation?.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(nextHandled = isHandled) {
    if (!canAnnotate) { setMessage("当前角色没有处理物流轨迹的权限"); return; }
    const tags = tagsText.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean);
    if (!note.trim() && !tags.length) { setMessage("请填写备注或选择一个跟进标签"); return; }
    setSaving(true); setMessage("");
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events/${event.id}/annotation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, tags, isHandled: nextHandled, expectedUpdatedAt: updatedAt }) });
    const payload = await response.json().catch(() => null) as {
      data?: {
        handledAt: string | null;
        updatedAt: string;
        handledByMembership?: { user?: { fullName: string | null; username: string } } | null;
      };
      error?: { message?: string };
    } | null; setSaving(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "保存失败"); return; }
    setIsHandled(nextHandled);
    setHandledAt(payload?.data?.handledAt ?? null);
    setUpdatedAt(payload?.data?.updatedAt ?? updatedAt);
    setHandledBy(payload?.data?.handledByMembership?.user ?? null);
    setMessage("已保存");
    router.refresh();
  }
  const toggleQuickTag = (tag: string) => {
    const tags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
    setTagsText((tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]).join("、"));
  };
  async function saveTranslation() {
    if (!manualTranslation.trim()) { setTranslationMessage("请填写人工核对后的中文"); return; }
    setSaving(true); setTranslationMessage("");
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events/${event.id}/translation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ translatedText: manualTranslation }) });
    const payload = await response.json().catch(() => null); setSaving(false);
    setTranslationMessage(response.ok ? "人工核对结果已保存" : payload?.error?.message ?? "保存失败");
    if (response.ok) router.refresh();
  }
  const currentTags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  return <section className={`rounded-xl border p-4 ${isHandled ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
    {canAnnotate && event.memo && <div className="mb-3 flex flex-col gap-2 rounded-lg border border-violet-100 bg-violet-50/60 p-3 sm:flex-row"><input value={manualTranslation} onChange={(inputEvent) => setManualTranslation(inputEvent.target.value)} maxLength={1000} className="h-10 min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" placeholder="人工核对后的中文结果" /><button type="button" disabled={saving} onClick={() => void saveTranslation()} className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">保存核对结果</button>{translationMessage && <span className="self-center text-xs text-violet-700">{translationMessage}</span>}</div>}
    {canAnnotate && allowBatchSelection && <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selected} onChange={onToggleSelection} aria-label={`选择轨迹 ${event.eventType}`} className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />加入批量处理</label>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start"><span className={`mt-1 size-3 shrink-0 rounded-full ${isHandled ? "bg-emerald-500" : /FAILED|EXCEPTION|ADDRESS|RETURN|REFUS/i.test(event.eventType) ? "bg-rose-500" : "bg-violet-500"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{eventLabel}</strong>{milestoneLabel && milestoneLabel !== eventLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{milestoneLabel}</span>}<span className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString("zh-CN")} · {event.location || "位置未知"}</span></div><p className="mt-1 text-sm font-medium text-slate-700">{event.memo || "暂无轨迹原文"}</p>{memoLabel !== event.memo && <p className="mt-1 text-sm text-violet-700"><span className="font-semibold">中文：</span>{memoLabel}</p>}{canAnnotate ? <><div className="mt-3 grid gap-2 lg:grid-cols-[1fr_0.7fr_auto]"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="记录本次联系客户的结果或处理备注" /><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="标签，用逗号分隔，如：已通知、无人接听" /><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => save()} className="inline-flex h-10 items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Save size={14} />保存</button><button type="button" disabled={saving} onClick={() => save(!isHandled)} className={`inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold ${isHandled ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white"}`}><CheckCircle2 size={14} />{isHandled ? "重新处理" : "标记完成"}</button></div></div><div className="mt-2 flex flex-wrap gap-2"><span className="text-xs font-medium text-slate-500">快捷标签：</span>{quickTags.map((tag) => <button key={tag} type="button" disabled={saving} onClick={() => toggleQuickTag(tag)} className={`rounded-full border px-2.5 py-1 text-xs ${currentTags.includes(tag) ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"}`}>{tag}</button>)}</div></> : <p className="mt-3 text-xs text-slate-400">当前角色仅可查看，不能填写备注或处理轨迹。</p>}<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">{message && <span className={message === "已保存" ? "text-emerald-600" : "text-rose-600"}>{message}</span>}{handledBy && <span className="text-slate-500">处理人：{handledBy.fullName || handledBy.username}</span>}{handledAt && <span className="text-slate-400">处理时间：{new Date(handledAt).toLocaleString("zh-CN")}</span>}</div></div></div>
  </section>;
}
