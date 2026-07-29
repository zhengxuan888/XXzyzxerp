"use client";

import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Mail, MessageCircle, Package, Save, Search, Truck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Annotation = { note: string | null; tags: string[]; isHandled: boolean; handledAt: string | null; handledByMembership?: { user?: { fullName: string | null; username: string } } | null };
type TrackingEvent = { id: string; occurredAt: string; eventType: string; statusMilestone: string | null; location: string | null; memo: string | null; annotation: Annotation | null };
type TrackingRow = { id: string; trackingNo: string | null; carrier: string | null; status: string; urgency: "critical" | "high" | "normal"; urgencyLabel: string; priorityTag: string; dueStatus: string; canViewTrackingNo: boolean; canViewTimeline: boolean; canAnnotate: boolean; order: { id: string; orderNo: string; recipientName: string | null; recipientPhone: string | null; recipientEmail: string | null; customerWhatsapp: string | null; codAmountLabel: string; customer: { name: string }; creatorUser: { username: string; fullName: string | null }; items: Array<{ productName: string; quantity: number }> }; events: TrackingEvent[] };
const QUICK_TAGS = ["已通知客户", "无人接听", "等待客户回复", "地址已确认", "需再次跟进"];

type QueueFilter = "all" | "critical" | "high" | "normal" | "unhandled";

export default function LogisticsTrackingWorkbench({
  rows,
  canViewTrackingNo,
  canViewTimeline,
  canAnnotate,
}: {
  rows: TrackingRow[];
  canViewTrackingNo: boolean;
  canViewTimeline: boolean;
  canAnnotate: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const visibleRows = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (queue === "critical" && row.urgency !== "critical") return false;
      if (queue === "high" && row.urgency !== "high") return false;
      if (queue === "normal" && row.urgency !== "normal") return false;
      if (queue === "unhandled" && !row.events.some((event) => !event.annotation?.isHandled)) return false;
      if (!term) return true;
      return `${row.trackingNo} ${row.order.orderNo} ${row.order.recipientName} ${row.order.recipientEmail} ${row.order.customerWhatsapp} ${row.order.items.map((item) => item.productName).join(" ")}`.toLowerCase().includes(term);
    });
  }, [keyword, queue, rows]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedRows = visibleRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const queueCards: Array<{ key: QueueFilter; label: string; count: number; tone: string }> = [
    { key: "all", label: "全部追踪", count: rows.length, tone: "border-slate-200 bg-white text-slate-900" },
    { key: "critical", label: "超期高风险", count: rows.filter((row) => row.urgency === "critical").length, tone: "border-rose-200 bg-rose-50 text-rose-900" },
    { key: "high", label: "需立即跟进", count: rows.filter((row) => row.urgency === "high").length, tone: "border-amber-200 bg-amber-50 text-amber-900" },
    { key: "normal", label: "正常运输", count: rows.filter((row) => row.urgency === "normal").length, tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
    { key: "unhandled", label: "存在未处理轨迹", count: rows.filter((row) => row.events.some((event) => !event.annotation?.isHandled)).length, tone: "border-violet-200 bg-violet-50 text-violet-900" },
  ];

  return <div className="space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-violet-700"><Truck size={20} /><span className="text-sm font-semibold">物流与售后</span></div><h1 className="mt-2 text-2xl font-bold text-slate-950">物流追踪工作台</h1><p className="mt-1 text-sm text-slate-500">集中查看客户、订单、产品与物流轨迹；每条轨迹都可以单独备注、打标签和标记处理完成。</p></div>
        <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 lg:max-w-md"><Search size={17} className="text-slate-400" /><input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={canViewTrackingNo ? "订单号、物流单号、客户、邮箱、WhatsApp、产品" : "订单号、客户、邮箱、WhatsApp、产品"} /></label>
      </div>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {queueCards.map((card) => <button key={card.key} type="button" onClick={() => { setQueue(card.key); setPage(1); }} className={`rounded-2xl border p-4 text-left shadow-sm transition ${card.tone} ${queue === card.key ? "ring-2 ring-amber-500 ring-offset-2" : "hover:-translate-y-0.5"}`}><p className="text-xs font-medium opacity-70">{card.label}</p><p className="mt-1 text-2xl font-bold">{card.count}</p></button>)}
    </section>
    {!canViewTrackingNo && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流单号”权限，页面已隐藏物流单号。</p>}
    {!canViewTimeline && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色未配置“查看物流轨迹”权限，页面已隐藏全部轨迹。</p>}
    {canViewTimeline && !canAnnotate && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">当前角色可查看物流轨迹，但未配置“处理物流轨迹”权限，备注和完成按钮已隐藏。</p>}
    {pagedRows.map((row) => { const isOpen = expanded[row.id] ?? false; return <article key={row.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${row.urgency === "critical" ? "border-rose-300" : row.urgency === "high" ? "border-amber-300" : "border-slate-200"}`}>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.2fr_1.3fr_1fr_auto] xl:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.urgency === "critical" ? "bg-rose-50 text-rose-700" : row.urgency === "high" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{row.urgencyLabel}</span>{row.priorityTag !== "-" && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{row.priorityTag}</span>}</div><p className="mt-2 font-mono text-sm font-semibold text-slate-900">{row.trackingNo || "暂无物流单号"}</p><p className="mt-1 text-xs text-slate-500">{row.carrier || "未填写物流商"} · {row.dueStatus}</p></div>
        <div><Link href={`/admin/orders/${row.order.id}`} className="font-semibold text-violet-700 hover:underline">{row.order.orderNo}</Link><p className="mt-1 text-sm text-slate-700">{row.order.customer.name} / {row.order.recipientName || "未填写收件人"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Mail size={13} />{row.order.recipientEmail || "-"}</span><span className="inline-flex items-center gap-1"><MessageCircle size={13} />{row.order.customerWhatsapp || "-"}</span><span>{row.order.recipientPhone || "-"}</span></div></div>
        <div><div className="flex items-start gap-2"><Package size={16} className="mt-0.5 shrink-0 text-slate-400" /><div className="text-sm text-slate-700">{row.order.items.map((item) => `${item.productName} × ${item.quantity}`).join("、") || "未记录产品"}</div></div><p className="mt-2 text-xs text-slate-500">COD：<strong className="text-slate-800">{row.order.codAmountLabel}</strong> · 销售：{row.order.creatorUser.fullName || row.order.creatorUser.username}</p></div>
        {row.canViewTimeline && <button type="button" onClick={() => setExpanded((value) => ({ ...value, [row.id]: !isOpen }))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{isOpen ? "收起轨迹" : `展开轨迹 ${row.events.length}`}</button>}
      </div>
      {row.canViewTimeline && row.events.length > 0 && <div className="border-t border-slate-200 bg-slate-50/60 p-4"><div className="mb-2 text-xs font-medium text-slate-500">{isOpen ? `共 ${row.events.length} 条轨迹，轨迹区域可独立滚动` : "最新物流轨迹"}</div><div className={`${isOpen ? "max-h-[34rem] overflow-y-auto pr-1" : ""} space-y-3`}>{(isOpen ? row.events : row.events.slice(0, 1)).map((event) => <EventEditor key={event.id} shipmentId={row.id} event={event} canAnnotate={row.canAnnotate} />)}</div></div>}
    </article>; })}
    {!visibleRows.length && <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">没有找到匹配的物流订单。</div>}
    {visibleRows.length > 0 && <footer className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span>共 {visibleRows.length} 条</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-2"><option value={10}>10 / 页</option><option value={20}>20 / 页</option><option value={50}>50 / 页</option></select></div><div className="flex items-center gap-2"><span>第 {safePage}/{pageCount} 页</span><button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40"><ChevronLeft size={15} />上一页</button><button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40">下一页<ChevronRight size={15} /></button></div></footer>}
  </div>;
}

function EventEditor({ shipmentId, event, canAnnotate }: { shipmentId: string; event: TrackingEvent; canAnnotate: boolean }) {
  const [note, setNote] = useState(event.annotation?.note ?? "");
  const [tagsText, setTagsText] = useState((event.annotation?.tags ?? []).join("、"));
  const [isHandled, setIsHandled] = useState(event.annotation?.isHandled ?? false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(nextHandled = isHandled) {
    if (!canAnnotate) { setMessage("当前角色没有处理物流轨迹的权限"); return; }
    if (!note.trim()) { setMessage("请先填写本条轨迹备注"); return; }
    setSaving(true); setMessage("");
    const tags = tagsText.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean);
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events/${event.id}/annotation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, tags, isHandled: nextHandled }) });
    const payload = await response.json().catch(() => null); setSaving(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "保存失败"); return; }
    setIsHandled(nextHandled); setMessage("已保存");
  }
  const toggleQuickTag = (tag: string) => {
    const tags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
    setTagsText((tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]).join("、"));
  };
  const currentTags = tagsText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  return <section className={`rounded-xl border p-4 ${isHandled ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start"><span className={`mt-1 size-3 shrink-0 rounded-full ${isHandled ? "bg-emerald-500" : /FAILED|EXCEPTION|ADDRESS|RETURN|REFUS/i.test(event.eventType) ? "bg-rose-500" : "bg-violet-500"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{event.eventType}</strong>{event.statusMilestone && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{event.statusMilestone}</span>}<span className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString("zh-CN")} · {event.location || "位置未知"}</span></div><p className="mt-1 text-sm text-slate-600">{event.memo || "暂无轨迹说明"}</p>{canAnnotate ? <><div className="mt-3 grid gap-2 lg:grid-cols-[1fr_0.7fr_auto]"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="记录本次联系客户的结果或处理备注" /><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="标签，用逗号分隔，如：已通知、无人接听" /><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => save()} className="inline-flex h-10 items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Save size={14} />保存</button><button type="button" disabled={saving} onClick={() => save(!isHandled)} className={`inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold ${isHandled ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white"}`}><CheckCircle2 size={14} />{isHandled ? "重新处理" : "标记完成"}</button></div></div><div className="mt-2 flex flex-wrap gap-2"><span className="text-xs font-medium text-slate-500">快捷标签：</span>{QUICK_TAGS.map((tag) => <button key={tag} type="button" disabled={saving} onClick={() => toggleQuickTag(tag)} className={`rounded-full border px-2.5 py-1 text-xs ${currentTags.includes(tag) ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"}`}>{tag}</button>)}</div></> : <p className="mt-3 text-xs text-slate-400">当前角色仅可查看，不能填写备注或处理轨迹。</p>}<div className="mt-2 flex items-center gap-2 text-xs">{message && <span className={message === "已保存" ? "text-emerald-600" : "text-rose-600"}>{message}</span>}{event.annotation?.handledByMembership?.user && <span className="text-slate-400">上次处理：{event.annotation.handledByMembership.user.fullName || event.annotation.handledByMembership.user.username}</span>}</div></div></div>
  </section>;
}
