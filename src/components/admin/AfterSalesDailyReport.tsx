"use client";

import { Check, ClipboardCopy, Loader2, RefreshCw, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Row = { membershipId: string; employeeName: string; username: string; departmentName: string; todayOrders: number; monthOrders: number; previousMonthOrders: number; todayShipped: number; monthShipped: number; previousMonthShipped: number; todayDelivered: number; monthDelivered: number; previousMonthDelivered: number };
type Payload = { date: string; businessUnitName: string; summary: Record<string, number>; rows: Row[] };

const summaryCards: Array<[string, string]> = [
  ["todayTracking", "今日跟踪"], ["todayOrders", "今日开单"], ["monthOrders", "本月开单"], ["previousMonthOrders", "上月开单"],
  ["todayShipped", "今日发货"], ["monthShipped", "本月发货"], ["previousMonthShipped", "上月发货"], ["currentInTransit", "当前在途"],
  ["previousMonthInTransit", "上月末在途"], ["todayDelivered", "今日签收"], ["monthDelivered", "本月签收"], ["previousMonthDelivered", "上月签收"],
];

export default function AfterSalesDailyReport() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/mvp/after-sales-daily-report", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "售后日报加载失败。"); return; }
    setData(payload.data);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function copyReport() {
    if (!data) return;
    const s = data.summary;
    const lines = [`${data.date} 售后统一日报`, `今日跟踪 ${s.todayTracking}｜今日开单 ${s.todayOrders}｜今日发货 ${s.todayShipped}｜今日签收 ${s.todayDelivered}`, `本月开单 ${s.monthOrders}｜本月发货 ${s.monthShipped}｜当前在途 ${s.currentInTransit}｜本月签收 ${s.monthDelivered}`, `上月开单 ${s.previousMonthOrders}｜上月发货 ${s.previousMonthShipped}｜上月末在途 ${s.previousMonthInTransit}｜上月签收 ${s.previousMonthDelivered}`, "", "员工明细", ...data.rows.map((row) => `${row.employeeName}：今日开单 ${row.todayOrders}，今日发货 ${row.todayShipped}，今日签收 ${row.todayDelivered}，本月开单 ${row.monthOrders}，本月签收 ${row.monthDelivered}`)];
    await navigator.clipboard.writeText(lines.join("\n")); setMessage("日报文字已复制，可以直接粘贴到工作群。");
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 via-white to-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Truck size={19} /></span><div><p className="text-xs font-semibold text-amber-700">物流与售后 · {data?.businessUnitName ?? "当前业务板块"}</p><h2 className="text-lg font-bold text-slate-950">售后统一日报</h2><p className="text-xs text-slate-500">{data?.date ?? "今日"} · 订单、发货、在途与签收自动汇总</p></div></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</button><button type="button" onClick={() => void copyReport()} disabled={!data} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><ClipboardCopy size={15} />复制群报</button></div>
    </header>
    {loading && !data ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />正在汇总今日数据…</div> : <>
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-6">{summaryCards.map(([key, label]) => <article key={key} className="bg-white px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{data?.summary[key] ?? 0}<span className="ml-1 text-xs font-medium text-slate-400">单</span></p></article>)}</div>
      <div className="border-t border-slate-100 px-5 py-4"><div className="mb-3"><h3 className="font-bold text-slate-900">员工订单业绩</h3><p className="text-xs text-slate-500">全部数据来自 ERP 订单与物流状态，无需人工填写。</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="rounded-l-xl px-3 py-3">员工</th><th className="px-3 py-3">今日开单</th><th className="px-3 py-3">今日发货</th><th className="px-3 py-3">今日签收</th><th className="px-3 py-3">本月签收</th><th className="px-3 py-3">上月签收</th><th className="rounded-r-xl px-3 py-3">本月开单</th></tr></thead><tbody>{data?.rows.map((row) => <tr key={row.membershipId} className="border-b border-slate-100"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{row.employeeName}</p><p className="text-xs text-slate-400">{row.departmentName}</p></td><td className="px-3 py-3 font-bold">{row.todayOrders}</td><td className="px-3 py-3 font-semibold">{row.todayShipped}</td><td className="px-3 py-3 font-semibold">{row.todayDelivered}</td><td className="px-3 py-3">{row.monthDelivered}</td><td className="px-3 py-3">{row.previousMonthDelivered}</td><td className="px-3 py-3 font-bold">{row.monthOrders}</td></tr>)}{!data?.rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">当前权限范围内暂无员工数据</td></tr>}</tbody></table></div>
      </div>
    </>}
    {message && <div role="status" className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-700"><Check size={15} className="text-emerald-600" />{message}</div>}
  </section>;
}
