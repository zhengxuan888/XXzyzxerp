"use client";

import { BarChart3, ChevronLeft, ChevronRight, Globe2, PackageCheck, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type Payload = {
  range: { start: string; end: string };
  scope: {
    canViewTeam: boolean;
    departments: { id: string; name: string }[];
    memberships: { id: string; employeeName: string; username: string; departmentId: string | null }[];
  };
  summary: {
    orderCount: number;
    employeeCount: number;
    countryCount: number;
    averageOrdersPerDay: number;
    currencyTotals: { currency: string; amountCents: number }[];
  };
  daily: { date: string; count: number; amountCents: number }[];
  countries: { countryCode: string; count: number }[];
  statuses: { status: string; count: number }[];
  rankings: { membershipId: string; employeeName: string; username: string; departmentName: string; count: number; currencyTotals: { currency: string; amountCents: number }[] }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  truncated: boolean;
};

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

export default function StatisticsWorkbench() {
  const now = useMemo(() => new Date(), []);
  const [start, setStart] = useState(isoDate(new Date(now.getTime() - 29 * 86_400_000)));
  const [end, setEnd] = useState(isoDate(now));
  const [departmentId, setDepartmentId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ start, end, page: String(page), pageSize: String(pageSize) });
    if (departmentId) params.set("departmentId", departmentId);
    if (membershipId) params.set("membershipId", membershipId);
    const response = await fetch(`/api/mvp/statistics?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) setError(response.status === 403 ? "当前筛选超出你的数据权限范围。" : "统计数据加载失败，请检查日期范围。");
    else setData(result);
    setLoading(false);
  }, [departmentId, end, membershipId, page, pageSize, start]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function quickRange(days: number) {
    const rangeEnd = new Date();
    setEnd(isoDate(rangeEnd));
    setStart(isoDate(new Date(rangeEnd.getTime() - (days - 1) * 86_400_000)));
    setPage(1);
  }

  const employees = data?.scope.memberships.filter((item) => !departmentId || item.departmentId === departmentId) ?? [];
  const maxDaily = Math.max(1, ...(data?.daily.map((item) => item.count) ?? [1]));
  const maxCountry = Math.max(1, ...(data?.countries.map((item) => item.count) ?? [1]));

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-amber-700">数据与报表</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">统计报表</h1>
        <p className="mt-1 text-sm text-slate-500">员工看本人，上级按授权范围查看团队；不同业务板块的数据不会混合。</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-semibold text-slate-600">开始日期<input type="date" value={start} onChange={(event) => { setStart(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">结束日期<input type="date" value={end} onChange={(event) => { setEnd(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">部门<select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setMembershipId(""); setPage(1); }} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="">全部可见部门</option>{data?.scope.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">员工<select value={membershipId} onChange={(event) => { setMembershipId(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="">团队汇总</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeName}（{item.username}）</option>)}</select></label>
          <div className="flex items-end gap-2 xl:col-span-2">
            <Button type="button" variant="ghost" onClick={() => quickRange(7)}>近7天</Button>
            <Button type="button" variant="ghost" onClick={() => quickRange(30)}>近30天</Button>
            <Button type="button" onClick={() => void load()}>刷新统计</Button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {data?.truncated && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前范围数据量较大，仅展示前 50,000 条，请缩小日期范围。</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "期间订单", value: data?.summary.orderCount ?? 0, suffix: "单", icon: PackageCheck },
          { label: "有订单员工", value: data?.summary.employeeCount ?? 0, suffix: "人", icon: UsersRound },
          { label: "覆盖国家", value: data?.summary.countryCount ?? 0, suffix: "个", icon: Globe2 },
          { label: "日均开单", value: data?.summary.averageOrdersPerDay ?? 0, suffix: "单", icon: BarChart3 },
        ].map((card) => <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><card.icon className="text-amber-600" size={20} /><p className="mt-3 text-xs text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{card.value}<span className="ml-1 text-xs font-medium text-slate-400">{card.suffix}</span></p></article>)}
        <article className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm"><p className="text-xs text-amber-700">COD 金额（按币种）</p><div className="mt-2 space-y-1">{data?.summary.currencyTotals.length ? data.summary.currencyTotals.map((item) => <p key={item.currency} className="font-bold text-slate-950">{money(item.amountCents, item.currency)}</p>) : <p className="text-2xl font-bold">—</p>}</div></article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">订单趋势</h2><p className="text-xs text-slate-500">每日有效订单数</p><div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto">{data?.daily.length ? data.daily.map((item) => <div key={item.date} title={`${item.date}：${item.count} 单`} className="flex min-w-7 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] text-slate-500">{item.count}</span><div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max(4, item.count / maxDaily * 150)}px` }} /><span className="rotate-[-45deg] whitespace-nowrap text-[9px] text-slate-400">{item.date.slice(5)}</span></div>) : <p className="m-auto text-sm text-slate-400">当前范围暂无订单</p>}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">订单国家分布</h2><p className="text-xs text-slate-500">按收件国家统计</p><div className="mt-5 space-y-3">{data?.countries.slice(0, 10).map((item) => <div key={item.countryCode} className="grid grid-cols-[52px_1fr_44px] items-center gap-3 text-sm"><span className="font-semibold">{item.countryCode === "UNKNOWN" ? "未知" : item.countryCode}</span><div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${item.count / maxCountry * 100}%` }} /></div><span className="text-right text-slate-500">{item.count}</span></div>)}{!data?.countries.length && <p className="py-16 text-center text-sm text-slate-400">当前范围暂无数据</p>}</div></article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-950">员工订单排行</h2><p className="text-xs text-slate-500">只统计当前授权范围内的员工</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">员工</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">订单数</th><th className="px-4 py-3">COD 合计</th></tr></thead><tbody>{data?.rankings.map((row) => <tr key={row.membershipId} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-semibold">{row.employeeName}</p><p className="text-xs text-slate-400">{row.username}</p></td><td className="px-4 py-3">{row.departmentName}</td><td className="px-4 py-3 font-bold">{row.count}</td><td className="px-4 py-3 text-slate-500">{row.currencyTotals.map((item) => <span key={item.currency} className="mr-3 whitespace-nowrap">{money(item.amountCents, item.currency)}</span>)}</td></tr>)}</tbody></table></div>
        {loading && <p className="px-4 py-8 text-center text-sm text-slate-400">正在加载统计…</p>}
        {!loading && !data?.rankings.length && <p className="px-4 py-8 text-center text-sm text-slate-400">当前范围暂无员工订单</p>}
        <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span>共 {data?.pagination.total ?? 0} 人</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-2"><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option></select></div><div className="flex items-center gap-2"><span>第 {data?.pagination.page ?? 1}/{data?.pagination.totalPages ?? 1} 页</span><Button type="button" variant="ghost" size="icon" aria-label="上一页" disabled={(data?.pagination.page ?? 1) <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></Button><Button type="button" variant="ghost" size="icon" aria-label="下一页" disabled={(data?.pagination.page ?? 1) >= (data?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></Button></div></footer>
      </section>
      <p className="text-xs text-slate-400">多币种金额分别统计，不进行未经配置的汇率换算。</p>
    </div>
  );
}
