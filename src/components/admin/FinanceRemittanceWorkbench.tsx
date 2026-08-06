"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = { id: string; statementNo: string; source: string; receivedAt: string; originalOrderNo: string; trackingNo: string | null; recipientName: string | null; country: string | null; amount: number; currency: string; matchStatus: string; description: string | null };
type Payload = { items: Row[]; summary: { total: number; matched: number; unmatched: number; amounts: Array<{ currency: string; amount: number }> }; filters: { counterparties: Array<{ id: string; name: string }>; countries: string[] }; pagination: { page: number; pageCount: number; total: number } };

const matchLabels: Record<string, string> = { MATCHED: "已匹配", SUGGESTED: "待确认", AMOUNT_MISMATCH: "金额差异", UNMATCHED: "待匹配", IGNORED: "已忽略" };

export default function FinanceRemittanceWorkbench() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: "", country: "", counterpartyId: "", matchStatus: "", start: "", end: "" });
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "30" });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filters, page]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/mvp/finance/remittances?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) setError(body?.error?.message ?? "回款数据加载失败。");
    else setData(body.data);
    setLoading(false);
  }, [query]);
  // The request lifecycle intentionally owns the loading and result state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const setFilter = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };

  return <main className="space-y-4 p-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-amber-700">财务与审批</p><h1 className="mt-1 text-2xl font-bold text-slate-950">回款数据</h1><p className="mt-1 text-sm text-slate-500">仅系统管理员可见。按回款账单核对历史订单、物流单号和签收金额。</p></div><button onClick={() => void load()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">刷新数据</button></div>
    </section>
    <section className="grid gap-3 md:grid-cols-4">
      <Metric label="总签收" value={`${data?.summary.total ?? 0} 单`} />
      <Metric label="签收金额" value={data?.summary.amounts.map((item) => `${item.currency} ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ") || "0.00"} />
      <Metric label="已匹配历史订单" value={`${data?.summary.matched ?? 0} 单`} tone="green" />
      <Metric label="待匹配" value={`${data?.summary.unmatched ?? 0} 单`} tone="amber" />
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-6">
        <input value={filters.q} onChange={(e) => setFilter("q", e.target.value)} placeholder="原单号、转单号、账单号" className="rounded-lg border border-slate-200 px-3 py-2 text-sm lg:col-span-2" />
        <select value={filters.counterpartyId} onChange={(e) => setFilter("counterpartyId", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">全部回款来源</option>{data?.filters.counterparties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={filters.country} onChange={(e) => setFilter("country", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">全部国家</option>{data?.filters.countries.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select value={filters.matchStatus} onChange={(e) => setFilter("matchStatus", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">全部匹配状态</option>{Object.entries(matchLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <div className="flex gap-2"><input type="date" value={filters.start} onChange={(e) => setFilter("start", e.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm" /><input type="date" value={filters.end} onChange={(e) => setFilter("end", e.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm" /></div>
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {error && <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["回款日期", "来源", "原单号", "转单/物流单号", "国家", "收件人", "回款金额", "匹配状态"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data?.items.map((row) => <tr key={row.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3">{new Date(row.receivedAt).toLocaleDateString("zh-CN")}</td><td className="px-4 py-3">{row.source}</td><td className="px-4 py-3 font-semibold text-slate-900">{row.originalOrderNo}</td><td className="px-4 py-3">{row.trackingNo ?? "—"}</td><td className="px-4 py-3">{row.country ?? "—"}</td><td className="px-4 py-3">{row.recipientName ?? "—"}</td><td className="whitespace-nowrap px-4 py-3 font-semibold">{row.currency} {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.matchStatus === "MATCHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{matchLabels[row.matchStatus] ?? row.matchStatus}</span></td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm"><span>{loading ? "加载中…" : `共 ${data?.pagination.total ?? 0} 条`}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">上一页</button><span className="px-2 py-1.5">{page} / {data?.pagination.pageCount || 1}</span><button disabled={page >= (data?.pagination.pageCount || 1)} onClick={() => setPage((n) => n + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">下一页</button></div></div>
    </section>
  </main>;
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "amber" }) {
  const styles = tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";
  return <div className={`rounded-2xl border p-5 shadow-sm ${styles}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-slate-950">{value}</p></div>;
}
