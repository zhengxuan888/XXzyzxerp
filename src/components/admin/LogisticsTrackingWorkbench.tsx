"use client";

import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Mail, MessageCircle, Package, Save, Search, Truck, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LogisticsQueueKey, LogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";

type Annotation = { note: string | null; tags: string[]; isHandled: boolean; handledAt: string | null; handledByMembership?: { user?: { fullName: string | null; username: string } } | null };
type TrackingEvent = { id: string; occurredAt: string; eventType: string; statusMilestone: string | null; location: string | null; memo: string | null; annotation: Annotation | null };
type TrackingRow = { id: string; trackingNo: string | null; carrier: string | null; status: string; urgency: "critical" | "high" | "normal"; urgencyLabel: string; priorityTag: string; dueStatus: string; canViewTrackingNo: boolean; canViewTimeline: boolean; canAnnotate: boolean; eventTotal: number; unhandledEventCount: number; queueSignals: string[]; followUpOwner: { id: string; user: { username: string; fullName: string | null } } | null; order: { id: string; orderNo: string; recipientName: string | null; recipientPhone: string | null; recipientEmail: string | null; customerWhatsapp: string | null; recipientCountryCode: string | null; codAmountLabel: string; customer: { name: string }; creatorUser: { username: string; fullName: string | null }; ownerMembership: { id: string; department: { id: string; name: string } | null; managerMembership: { id: string; user: { username: string; fullName: string | null } } | null }; items: Array<{ productName: string; quantity: number }> }; events: TrackingEvent[] };

function matchesConfiguredCard(row: TrackingRow, matches: string[]) {
  if (!matches.length) return false;
  const signals = new Set(row.queueSignals);
  signals.add(`STATUS:${row.status.toUpperCase()}`);
  if (row.eventTotal === 0) signals.add("NO_EVENTS");
  return matches.some((match) => signals.has(match.trim().toUpperCase()));
}
export default function LogisticsTrackingWorkbench({
  rows,
  config,
  canViewTrackingNo,
  canViewTimeline,
  canAnnotate,
  currentMembershipId,
  canReassign,
}: {
  rows: TrackingRow[];
  config: LogisticsWorkbenchConfig;
  canViewTrackingNo: boolean;
  canViewTimeline: boolean;
  canAnnotate: boolean;
  currentMembershipId: string;
  canReassign: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<LogisticsQueueKey>("all");
  const [departmentId, setDepartmentId] = useState("");
  const [managerMembershipId, setManagerMembershipId] = useState("");
  const [creatorMembershipId, setCreatorMembershipId] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [destination, setDestination] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [ownerQueue, setOwnerQueue] = useState<"all" | "mine" | "unassigned">("all");
  const [claimedOwners, setClaimedOwners] = useState<Record<string, string>>({});
  const visibleRows = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    const selectedCard = config.cards.find((card) => card.key === queue);
    return rows.filter((row) => {
      if (queue === "critical" && row.urgency !== "critical") return false;
      if (queue === "high" && row.urgency !== "high") return false;
      if (queue === "normal" && row.urgency !== "normal") return false;
      if (queue === "unhandled" && row.unhandledEventCount === 0) return false;
      if (queue === "in_transit" && !["PICKED_UP", "IN_TRANSIT"].includes(row.status)) return false;
      if (queue === "out_for_delivery" && row.status !== "OUT_FOR_DELIVERY") return false;
      if (queue === "delivered" && !["DELIVERED", "CLOSED"].includes(row.status)) return false;
      if (queue === "exception" && row.status !== "EXCEPTION") return false;
      if (queue === "returning" && !["RETURNING", "RETURNED"].includes(row.status)) return false;
      if (selectedCard?.matches.length && !matchesConfiguredCard(row, selectedCard.matches)) return false;
      if (departmentId && row.order.ownerMembership.department?.id !== departmentId) return false;
      if (managerMembershipId && row.order.ownerMembership.managerMembership?.id !== managerMembershipId) return false;
      if (creatorMembershipId && row.order.ownerMembership.id !== creatorMembershipId) return false;
      if (shipmentStatus && row.status !== shipmentStatus) return false;
      if (carrier && row.carrier !== carrier) return false;
      if (destination && row.order.recipientCountryCode !== destination) return false;
      const ownerId = claimedOwners[row.id] ?? row.followUpOwner?.id ?? null;
      if (ownerQueue === "mine" && ownerId !== currentMembershipId) return false;
      if (ownerQueue === "unassigned" && ownerId) return false;
      if (!term) return true;
      return `${row.trackingNo} ${row.order.orderNo} ${row.order.recipientName} ${row.order.recipientEmail} ${row.order.customerWhatsapp} ${row.order.creatorUser.fullName} ${row.order.creatorUser.username} ${row.order.items.map((item) => item.productName).join(" ")}`.toLowerCase().includes(term);
    });
  }, [carrier, claimedOwners, config.cards, creatorMembershipId, currentMembershipId, departmentId, destination, keyword, managerMembershipId, ownerQueue, queue, rows, shipmentStatus]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedRows = visibleRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const countFor = (key: LogisticsQueueKey) => {
    if (key === "all") return rows.length;
    if (key === "unhandled") return rows.filter((row) => row.unhandledEventCount > 0).length;
    if (key === "critical" || key === "high" || key === "normal") return rows.filter((row) => row.urgency === key).length;
    if (key === "in_transit") return rows.filter((row) => ["PICKED_UP", "IN_TRANSIT"].includes(row.status)).length;
    if (key === "out_for_delivery") return rows.filter((row) => row.status === "OUT_FOR_DELIVERY").length;
    if (key === "delivered") return rows.filter((row) => ["DELIVERED", "CLOSED"].includes(row.status)).length;
    if (key === "exception") return rows.filter((row) => row.status === "EXCEPTION").length;
    if (key === "returning") return rows.filter((row) => ["RETURNING", "RETURNED"].includes(row.status)).length;
    const card = config.cards.find((item) => item.key === key);
    return card ? rows.filter((row) => matchesConfiguredCard(row, card.matches)).length : 0;
  };
  const toneFor = (key: LogisticsQueueKey) => key === "critical" || key === "exception" ? "border-rose-200 bg-rose-50 text-rose-900" : key === "high" || key === "out_for_delivery" ? "border-amber-200 bg-amber-50 text-amber-900" : key === "normal" || key === "delivered" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : key === "unhandled" || key === "returning" ? "border-violet-200 bg-violet-50 text-violet-900" : key === "in_transit" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-900";
  const queueCards = config.cards.filter((card) => card.isVisible).map((card) => ({ ...card, count: countFor(card.key), tone: toneFor(card.key) }));
  const departments = [...new Map(rows.flatMap((row) => row.order.ownerMembership.department ? [[row.order.ownerMembership.department.id, row.order.ownerMembership.department] as const] : [])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const managers = [...new Map(rows.flatMap((row) => row.order.ownerMembership.managerMembership ? [[row.order.ownerMembership.managerMembership.id, row.order.ownerMembership.managerMembership] as const] : [])).values()].sort((a, b) => (a.user.fullName || a.user.username).localeCompare(b.user.fullName || b.user.username, "zh-CN"));
  const creators = [...new Map(rows.map((row) => [row.order.ownerMembership.id, { id: row.order.ownerMembership.id, user: row.order.creatorUser }] as const)).values()].sort((a, b) => (a.user.fullName || a.user.username).localeCompare(b.user.fullName || b.user.username, "zh-CN"));
  const shipmentStatuses = [...new Set(rows.map((row) => row.status))].sort();
  const carriers = [...new Set(rows.map((row) => row.carrier).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const destinations = [...new Set(rows.map((row) => row.order.recipientCountryCode).filter((value): value is string => Boolean(value)))].sort();

  return <div className="space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-violet-700"><Truck size={20} /><span className="text-sm font-semibold">物流与售后</span></div><h1 className="mt-2 text-2xl font-bold text-slate-950">物流追踪工作台</h1><p className="mt-1 text-sm text-slate-500">集中查看客户、订单、产品与物流轨迹；每条轨迹都可以单独备注、打标签和标记处理完成。</p></div>
        <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 lg:max-w-md"><Search size={17} className="text-slate-400" /><input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={canViewTrackingNo ? "订单号、物流单号、客户、销售、产品" : "订单号、客户、销售、产品"} /></label>
      </div>
    </header>
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6">
      <label className="grid gap-1 text-xs font-medium text-slate-500">部门<select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setManagerMembershipId(""); setCreatorMembershipId(""); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部部门</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">直属经理<select value={managerMembershipId} onChange={(event) => { setManagerMembershipId(event.target.value); setCreatorMembershipId(""); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部经理</option>{managers.filter((manager) => !departmentId || rows.some((row) => row.order.ownerMembership.department?.id === departmentId && row.order.ownerMembership.managerMembership?.id === manager.id)).map((manager) => <option key={manager.id} value={manager.id}>{manager.user.fullName || manager.user.username}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">销售<select value={creatorMembershipId} onChange={(event) => { setCreatorMembershipId(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部销售</option>{creators.filter((creator) => rows.some((row) => row.order.ownerMembership.id === creator.id && (!departmentId || row.order.ownerMembership.department?.id === departmentId) && (!managerMembershipId || row.order.ownerMembership.managerMembership?.id === managerMembershipId))).map((creator) => <option key={creator.id} value={creator.id}>{creator.user.fullName || creator.user.username}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">物流状态<select value={shipmentStatus} onChange={(event) => { setShipmentStatus(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部状态</option>{shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">物流商<select value={carrier} onChange={(event) => { setCarrier(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部物流商</option>{carriers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-500">目的地<select value={destination} onChange={(event) => { setDestination(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">全部目的地</option>{destinations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {queueCards.map((card) => <button key={card.key} type="button" onClick={() => { setQueue(card.key); setPage(1); }} className={`rounded-2xl border p-4 text-left shadow-sm transition ${card.tone} ${queue === card.key ? "ring-2 ring-amber-500 ring-offset-2" : "hover:-translate-y-0.5"}`}><p className="text-xs font-medium opacity-70">{card.label}</p><p className="mt-1 text-2xl font-bold">{card.count}</p></button>)}
    </section>
    {!canViewTrackingNo && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流单号”权限，页面已隐藏物流单号。</p>}
    {!canViewTimeline && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流轨迹”权限，页面已隐藏全部轨迹。</p>}
    {canViewTimeline && !canAnnotate && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">当前角色可查看物流轨迹，但未配置“处理物流轨迹”权限，备注和完成按钮已隐藏。</p>}
    {canAnnotate && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <span className="font-semibold text-slate-700">任务范围</span>
      {([["all", "全部任务"], ["mine", "我的待办"], ["unassigned", "未分配"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setOwnerQueue(value); setPage(1); }} className={`rounded-lg px-3 py-1.5 font-medium ${ownerQueue === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
    </div>}
    {pagedRows.map((row) => { const isOpen = expanded[row.id] ?? false; return <article key={row.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${row.urgency === "critical" ? "border-rose-300" : row.urgency === "high" ? "border-amber-300" : "border-slate-200"}`}>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.2fr_1.3fr_1fr_auto] xl:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.urgency === "critical" ? "bg-rose-50 text-rose-700" : row.urgency === "high" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}>{row.urgencyLabel}</span>{row.priorityTag !== "-" && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{row.priorityTag}</span>}</div><p className="mt-2 font-mono text-sm font-semibold text-slate-900">{row.trackingNo || "暂无物流单号"}</p><p className="mt-1 text-xs text-slate-500">{row.carrier || "未填写物流商"} · {row.order.recipientCountryCode || "目的地未知"} · {row.dueStatus}</p></div>
        <div><Link href={`/admin/orders/${row.order.id}`} className="font-semibold text-violet-700 hover:underline">{row.order.orderNo}</Link><p className="mt-1 text-sm text-slate-700">{row.order.customer.name} / {row.order.recipientName || "未填写收件人"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Mail size={13} />{row.order.recipientEmail || "-"}</span><span className="inline-flex items-center gap-1"><MessageCircle size={13} />{row.order.customerWhatsapp || "-"}</span><span>{row.order.recipientPhone || "-"}</span></div></div>
        <div><div className="flex items-start gap-2"><Package size={16} className="mt-0.5 shrink-0 text-slate-400" /><div className="text-sm text-slate-700">{row.order.items.map((item) => `${item.productName} × ${item.quantity}`).join("、") || "未记录产品"}</div></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>COD：<strong className="text-slate-800">{row.order.codAmountLabel}</strong></span><span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700"><UserRound size={13} />销售：{row.order.creatorUser.fullName || row.order.creatorUser.username}</span></div></div>
        <div className="flex flex-col gap-2">
          {row.canAnnotate && <ClaimButton shipmentId={row.id} currentMembershipId={currentMembershipId} ownerId={claimedOwners[row.id] ?? row.followUpOwner?.id ?? null} ownerName={claimedOwners[row.id] ? "我" : row.followUpOwner?.user.fullName || row.followUpOwner?.user.username || null} canReassign={canReassign} onClaimed={() => setClaimedOwners((current) => ({ ...current, [row.id]: currentMembershipId }))} />}
          {row.canViewTimeline && <button type="button" onClick={() => setExpanded((value) => ({ ...value, [row.id]: !isOpen }))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{isOpen ? "收起轨迹" : `展开轨迹 ${row.eventTotal}`}</button>}
        </div>
      </div>
      {row.canViewTimeline && row.events.length > 0 && <TrackingEventsPanel shipmentId={row.id} initialEvents={row.events} initialTotal={row.eventTotal} expanded={isOpen} canAnnotate={row.canAnnotate} quickTags={config.quickTags} />}
    </article>; })}
    {!visibleRows.length && <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">没有找到匹配的物流订单。</div>}
    {visibleRows.length > 0 && <footer className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span>共 {visibleRows.length} 条</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-2"><option value={10}>10 / 页</option><option value={20}>20 / 页</option><option value={50}>50 / 页</option></select></div><div className="flex items-center gap-2"><span>第 {safePage}/{pageCount} 页</span><button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40"><ChevronLeft size={15} />上一页</button><button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40">下一页<ChevronRight size={15} /></button></div></footer>}
  </div>;
}

function ClaimButton({ shipmentId, currentMembershipId, ownerId, ownerName, canReassign, onClaimed }: { shipmentId: string; currentMembershipId: string; ownerId: string | null; ownerName: string | null; canReassign: boolean; onClaimed: () => void }) {
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
  quickTags,
}: {
  shipmentId: string;
  initialEvents: TrackingEvent[];
  initialTotal: number;
  expanded: boolean;
  canAnnotate: boolean;
  quickTags: string[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");
  const [batchTags, setBatchTags] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const hasMore = events.length < total;

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError("");
    const nextPage = page + 1;
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events?page=${nextPage}&pageSize=10`);
    const payload = await response.json().catch(() => null) as {
      data?: TrackingEvent[];
      meta?: { total: number };
      error?: { message?: string };
    } | null;
    setLoading(false);
    if (!response.ok) {
      setError(payload?.error?.message ?? "加载更多轨迹失败");
      return;
    }
    const incoming = payload?.data ?? [];
    setEvents((current) => {
      const known = new Set(current.map((event) => event.id));
      return [...current, ...incoming.filter((event) => !known.has(event.id))];
    });
    setPage(nextPage);
    setTotal(payload?.meta?.total ?? total);
  }

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
        items: selected.map((eventId) => ({ shipmentId, eventId })),
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
  }

  const visibleEvents = expanded ? events : events.slice(0, 1);
  return <div className="border-t border-slate-200 bg-slate-50/60 p-4">
    <div className="mb-2 text-xs font-medium text-slate-500">{expanded ? `已加载 ${events.length} / ${total} 条轨迹，轨迹区域可独立滚动` : "最新物流轨迹"}</div>
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
      {visibleEvents.map((event) => <EventEditor key={`${event.id}:${event.annotation?.handledAt ?? "open"}:${event.annotation?.note ?? ""}`} shipmentId={shipmentId} event={event} canAnnotate={canAnnotate} quickTags={quickTags} selected={selected.includes(event.id)} onToggleSelection={() => setSelected((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} />)}
      {expanded && hasMore && <button type="button" disabled={loading} onClick={() => void loadMore()} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loading ? "正在加载…" : "加载更早轨迹"}</button>}
      {expanded && error && <p className="text-center text-xs text-rose-600">{error}</p>}
    </div>
  </div>;
}

function EventEditor({ shipmentId, event, canAnnotate, quickTags, selected, onToggleSelection }: { shipmentId: string; event: TrackingEvent; canAnnotate: boolean; quickTags: string[]; selected: boolean; onToggleSelection: () => void }) {
  const [note, setNote] = useState(event.annotation?.note ?? "");
  const [tagsText, setTagsText] = useState((event.annotation?.tags ?? []).join("、"));
  const [isHandled, setIsHandled] = useState(event.annotation?.isHandled ?? false);
  const [handledAt, setHandledAt] = useState(event.annotation?.handledAt ?? null);
  const [handledBy, setHandledBy] = useState(event.annotation?.handledByMembership?.user ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(nextHandled = isHandled) {
    if (!canAnnotate) { setMessage("当前角色没有处理物流轨迹的权限"); return; }
    if (!note.trim()) { setMessage("请先填写本条轨迹备注"); return; }
    setSaving(true); setMessage("");
    const tags = tagsText.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean);
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events/${event.id}/annotation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, tags, isHandled: nextHandled }) });
    const payload = await response.json().catch(() => null) as {
      data?: {
        handledAt: string | null;
        handledByMembership?: { user?: { fullName: string | null; username: string } } | null;
      };
      error?: { message?: string };
    } | null; setSaving(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "保存失败"); return; }
    setIsHandled(nextHandled);
    setHandledAt(payload?.data?.handledAt ?? null);
    setHandledBy(payload?.data?.handledByMembership?.user ?? null);
    setMessage("已保存");
  }
  const toggleQuickTag = (tag: string) => {
    const tags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
    setTagsText((tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]).join("、"));
  };
  const currentTags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  return <section className={`rounded-xl border p-4 ${isHandled ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
    {canAnnotate && <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selected} onChange={onToggleSelection} aria-label={`选择轨迹 ${event.eventType}`} className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />加入批量处理</label>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start"><span className={`mt-1 size-3 shrink-0 rounded-full ${isHandled ? "bg-emerald-500" : /FAILED|EXCEPTION|ADDRESS|RETURN|REFUS/i.test(event.eventType) ? "bg-rose-500" : "bg-violet-500"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{event.eventType}</strong>{event.statusMilestone && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{event.statusMilestone}</span>}<span className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString("zh-CN")} · {event.location || "位置未知"}</span></div><p className="mt-1 text-sm text-slate-600">{event.memo || "暂无轨迹说明"}</p>{canAnnotate ? <><div className="mt-3 grid gap-2 lg:grid-cols-[1fr_0.7fr_auto]"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="记录本次联系客户的结果或处理备注" /><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="标签，用逗号分隔，如：已通知、无人接听" /><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => save()} className="inline-flex h-10 items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Save size={14} />保存</button><button type="button" disabled={saving} onClick={() => save(!isHandled)} className={`inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold ${isHandled ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white"}`}><CheckCircle2 size={14} />{isHandled ? "重新处理" : "标记完成"}</button></div></div><div className="mt-2 flex flex-wrap gap-2"><span className="text-xs font-medium text-slate-500">快捷标签：</span>{quickTags.map((tag) => <button key={tag} type="button" disabled={saving} onClick={() => toggleQuickTag(tag)} className={`rounded-full border px-2.5 py-1 text-xs ${currentTags.includes(tag) ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"}`}>{tag}</button>)}</div></> : <p className="mt-3 text-xs text-slate-400">当前角色仅可查看，不能填写备注或处理轨迹。</p>}<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">{message && <span className={message === "已保存" ? "text-emerald-600" : "text-rose-600"}>{message}</span>}{handledBy && <span className="text-slate-500">处理人：{handledBy.fullName || handledBy.username}</span>}{handledAt && <span className="text-slate-400">处理时间：{new Date(handledAt).toLocaleString("zh-CN")}</span>}</div></div></div>
  </section>;
}
