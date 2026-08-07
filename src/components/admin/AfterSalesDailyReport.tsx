"use client";

import { AlertCircle, Check, ImageDown, Loader2, RefreshCw, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Row = { membershipId: string; employeeName: string; username: string; departmentName: string; todayOrders: number; monthOrders: number; previousMonthOrders: number; todayShipped: number; monthShipped: number; previousMonthShipped: number; todayDelivered: number; monthDelivered: number; previousMonthDelivered: number };
type Payload = { date: string; businessUnitName: string; summary: Record<string, number>; rows: Row[] };

const summaryCards: Array<[string, string]> = [
  ["todayTracking", "今日跟踪"], ["todayOrders", "今日开单"], ["monthOrders", "本月开单"], ["previousMonthOrders", "上月开单"],
  ["todayShipped", "今日发货"], ["monthShipped", "本月发货"], ["previousMonthShipped", "上月发货"], ["currentInTransit", "当前在途"],
  ["previousMonthInTransit", "上月末在途"], ["todayDelivered", "今日签收"], ["monthDelivered", "本月签收"], ["previousMonthDelivered", "上月签收"],
];

async function downloadReportImage(data: Payload) {
  const width = 1440;
  const rowHeight = 72;
  const height = 150 + 240 + 86 + Math.max(1, data.rows.length) * rowHeight + 70;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_NOT_SUPPORTED");
  context.scale(scale, scale);
  context.textBaseline = "middle";
  context.fillStyle = "#f5f7fa";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(24, 24, width - 48, height - 48);

  context.fillStyle = "#c49332";
  context.fillRect(48, 52, 54, 54);
  context.fillStyle = "#ffffff";
  context.font = "700 26px system-ui, 'Microsoft YaHei', sans-serif";
  context.textAlign = "center";
  context.fillText("S", 75, 80);
  context.textAlign = "left";
  context.fillStyle = "#111827";
  context.font = "700 28px system-ui, 'Microsoft YaHei', sans-serif";
  context.fillText("择优臻选 ERP · 售后统一日报", 122, 66);
  context.fillStyle = "#6b7280";
  context.font = "400 17px system-ui, 'Microsoft YaHei', sans-serif";
  context.fillText(`${data.date} · ${data.businessUnitName}`, 122, 99);
  context.fillStyle = "#f3f4f6";
  context.fillRect(48, 132, width - 96, 1);

  const cardWidth = (width - 96) / 6;
  summaryCards.forEach(([key, label], index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    const x = 48 + column * cardWidth;
    const y = 150 + row * 120;
    context.fillStyle = row === 0 ? "#fffdf7" : "#f8fafc";
    context.fillRect(x + 1, y + 1, cardWidth - 2, 112);
    context.fillStyle = "#6b7280";
    context.font = "500 16px system-ui, 'Microsoft YaHei', sans-serif";
    context.fillText(label, x + 18, y + 30);
    context.fillStyle = "#111827";
    context.font = "700 34px system-ui, 'Microsoft YaHei', sans-serif";
    context.fillText(String(data.summary[key] ?? 0), x + 18, y + 74);
    context.fillStyle = "#9ca3af";
    context.font = "500 14px system-ui, 'Microsoft YaHei', sans-serif";
    context.fillText("单", x + 66, y + 78);
  });

  const tableTop = 404;
  context.fillStyle = "#111827";
  context.font = "700 22px system-ui, 'Microsoft YaHei', sans-serif";
  context.fillText("员工订单业绩", 48, tableTop + 24);
  const headers = ["员工", "今日开单", "今日发货", "今日签收", "本月签收", "上月签收", "本月开单"];
  const columnWidths = [300, 180, 180, 180, 180, 180, 180];
  let cursorX = 48;
  context.fillStyle = "#f3f4f6";
  context.fillRect(48, tableTop + 54, width - 96, 54);
  headers.forEach((header, index) => {
    context.fillStyle = "#4b5563";
    context.font = "600 16px system-ui, 'Microsoft YaHei', sans-serif";
    context.fillText(header, cursorX + 16, tableTop + 81);
    cursorX += columnWidths[index];
  });

  if (!data.rows.length) {
    context.fillStyle = "#9ca3af";
    context.font = "400 18px system-ui, 'Microsoft YaHei', sans-serif";
    context.fillText("当前权限范围内暂无员工数据", 64, tableTop + 144);
  } else {
    data.rows.forEach((row, rowIndex) => {
      const y = tableTop + 108 + rowIndex * rowHeight;
      context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#fafafa";
      context.fillRect(48, y, width - 96, rowHeight);
      context.fillStyle = "#e5e7eb";
      context.fillRect(48, y + rowHeight - 1, width - 96, 1);
      context.fillStyle = "#111827";
      context.font = "600 17px system-ui, 'Microsoft YaHei', sans-serif";
      context.fillText(row.employeeName, 64, y + 25);
      context.fillStyle = "#9ca3af";
      context.font = "400 13px system-ui, 'Microsoft YaHei', sans-serif";
      context.fillText(row.departmentName, 64, y + 50);
      const values = [row.todayOrders, row.todayShipped, row.todayDelivered, row.monthDelivered, row.previousMonthDelivered, row.monthOrders];
      let valueX = 48 + columnWidths[0];
      values.forEach((value, index) => {
        context.fillStyle = "#111827";
        context.font = `${index === 0 || index === 5 ? "700" : "600"} 18px system-ui, 'Microsoft YaHei', sans-serif`;
        context.fillText(String(value), valueX + 16, y + rowHeight / 2);
        valueX += columnWidths[index + 1];
      });
    });
  }

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("IMAGE_EXPORT_FAILED")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `售后统一日报-${data.date}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AfterSalesDailyReport() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : "";
    const response = await fetch(`/api/mvp/after-sales-daily-report${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { setMessage({ type: "error", text: payload?.error?.message ?? "售后日报加载失败。" }); return; }
    setData(payload.data);
    setSelectedDate((current) => current || payload.data.date);
  }, [selectedDate]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function generateReportImage() {
    if (!data) return;
    setGenerating(true);
    try {
      await downloadReportImage(data);
      setMessage({ type: "success", text: "群报图片已生成并下载，可以直接发送到工作群。" });
    } catch {
      setMessage({ type: "error", text: "群报图片生成失败，请刷新页面后重试。" });
    } finally {
      setGenerating(false);
    }
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 via-white to-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Truck size={19} /></span><div><p className="text-xs font-semibold text-amber-700">物流与售后 · {data?.businessUnitName ?? "当前业务板块"}</p><h2 className="text-lg font-bold text-slate-950">售后统一日报</h2><p className="text-xs text-slate-500">{data?.date ?? "今日"}</p></div></div>
      <div className="flex flex-wrap gap-2"><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600"><span>查看日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent text-slate-900 outline-none" aria-label="售后日报日期" /></label><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</button><button type="button" onClick={() => void generateReportImage()} disabled={!data || generating} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{generating ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />}生成群报图片</button></div>
    </header>
    {loading && !data ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />正在汇总今日数据…</div> : <>
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-6">{summaryCards.map(([key, label]) => <article key={key} className="bg-white px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{data?.summary[key] ?? 0}<span className="ml-1 text-xs font-medium text-slate-400">单</span></p></article>)}</div>
      <div className="border-t border-slate-100 px-5 py-4"><div className="mb-3"><h3 className="font-bold text-slate-900">员工订单业绩</h3></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="rounded-l-xl px-3 py-3">员工</th><th className="px-3 py-3">今日开单</th><th className="px-3 py-3">今日发货</th><th className="px-3 py-3">今日签收</th><th className="px-3 py-3">本月签收</th><th className="px-3 py-3">上月签收</th><th className="rounded-r-xl px-3 py-3">本月开单</th></tr></thead><tbody>{data?.rows.map((row) => <tr key={row.membershipId} className="border-b border-slate-100"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{row.employeeName}</p><p className="text-xs text-slate-400">{row.departmentName}</p></td><td className="px-3 py-3 font-bold">{row.todayOrders}</td><td className="px-3 py-3 font-semibold">{row.todayShipped}</td><td className="px-3 py-3 font-semibold">{row.todayDelivered}</td><td className="px-3 py-3">{row.monthDelivered}</td><td className="px-3 py-3">{row.previousMonthDelivered}</td><td className="px-3 py-3 font-bold">{row.monthOrders}</td></tr>)}{!data?.rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">当前权限范围内暂无员工数据</td></tr>}</tbody></table></div>
      </div>
    </>}
    {message && <div role="status" className={`flex items-center gap-2 border-t px-5 py-3 text-sm ${message.type === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-700"}`}>{message.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}{message.text}</div>}
  </section>;
}
