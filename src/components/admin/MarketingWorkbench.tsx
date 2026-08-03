"use client";

import Link from "next/link";
import { BarChart3, ChevronRight, ClipboardPenLine, LoaderCircle, RefreshCw, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type WorkbenchCard = {
  key: string;
  kind: "METRIC" | "QUEUE" | "QUICK_ACTION";
  label: string;
  description: string;
  zone: "FOCUS" | "OVERVIEW" | "QUICK";
  href: string | null;
  value: string | number | null;
  valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT" | null;
  isDerived: boolean;
};

type WorkbenchPayload = {
  date: string;
  currency: string | null;
  currencyChoices: string[];
  cards: WorkbenchCard[];
  summary: { submittedReports: number; returnedReports: number; pendingReview: number };
};

function displayValue(card: WorkbenchCard) {
  if (card.value == null || card.value === "") return "—";
  if (card.valueType === "PERCENT") return `${card.value}%`;
  if (card.valueType === "MONEY_CENTS") {
    const matched = /^(-?)(\d+)$/.exec(String(card.value));
    if (!matched) return "—";
    const [, sign, digits] = matched;
    const padded = digits.padStart(3, "0");
    return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }
  return String(card.value);
}

function zoneTitle(zone: WorkbenchCard["zone"]) {
  if (zone === "FOCUS") return { title: "今日优先处理", description: "只显示当前岗位在授权范围内需要推进的事项。" };
  if (zone === "OVERVIEW") return { title: "数据概览", description: "原始事实汇总后再计算比率，避免平均数误导。" };
  return { title: "常用入口", description: "入口可以由拥有配置权限的人按员工、部门或角色调整。" };
}

export default function MarketingWorkbench() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("");
  const [data, setData] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date });
      if (currency) params.set("currency", currency);
      const response = await fetch(`/api/mvp/marketing/workbench?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "投放工作台加载失败。");
      setData(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "投放工作台加载失败。");
    } finally {
      setLoading(false);
    }
  }, [currency, date]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const grouped = (zone: WorkbenchCard["zone"]) => data?.cards.filter((card) => card.zone === zone) ?? [];
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 shadow-[var(--elevation-card)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border-[44px] border-amber-100/60" />
        <div className="pointer-events-none absolute -bottom-24 right-40 size-56 rounded-full border-[38px] border-blue-100/45" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.14em] text-amber-700">投放运营</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-950">我的投放工作台</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">日报、目标和素材在一个入口协同；显示什么、排在哪里、谁能看，全部由配置和当前权限范围决定。</p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2 rounded-xl border border-white bg-white/72 p-1.5 shadow-sm backdrop-blur">
            {(data?.currencyChoices.length ?? 0) > 1 && <select aria-label="统计币种" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"><option value="">选择币种</option>{data?.currencyChoices.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
            <input aria-label="工作台日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700" />
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50" aria-label="刷新工作台"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">重试</button></div>}

      {loading && !data ? (
        <section className="grid min-h-60 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={18} />正在加载当前权限范围内的工作…</span></section>
      ) : (
        (["FOCUS", "OVERVIEW", "QUICK"] as const).map((zone) => {
          const cards = grouped(zone);
          if (!cards.length) return null;
          const info = zoneTitle(zone);
          return (
            <section key={zone} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-5 shadow-[var(--elevation-card)] backdrop-blur-xl">
              <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-700">{zone === "FOCUS" ? "待办优先级" : zone === "OVERVIEW" ? "可配置指标" : "快捷操作"}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{info.title}</h2><p className="mt-1 text-xs text-slate-500">{info.description}</p></div>{zone === "FOCUS" && <Target className="text-amber-600" size={21} />}{zone === "OVERVIEW" && <BarChart3 className="text-amber-600" size={21} />}{zone === "QUICK" && <ClipboardPenLine className="text-amber-600" size={21} />}</div>
              {zone === "OVERVIEW" && data && data.currencyChoices.length > 1 && !data.currency && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">当前范围含多种币种。请选择币种后再查看金额和比率，系统不会混合不同币种计算。</p>}
              <div className={`grid gap-3 ${zone === "QUICK" ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
                {cards.map((card) => {
                  const content = <>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-slate-950">{card.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{card.description}</p></div>{card.kind !== "QUICK_ACTION" && <span className="shrink-0 text-2xl font-black tabular-nums text-amber-800">{displayValue(card)}</span>}{card.kind === "QUICK_ACTION" && <ChevronRight className="shrink-0 text-amber-700" size={18} />}</div>
                    {card.isDerived && <p className="mt-3 text-[11px] font-medium text-slate-400">系统按原始数据计算</p>}
                  </>;
                  return card.href ? <Link key={card.key} href={card.href} className="rounded-xl border border-slate-200/80 bg-white/76 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:bg-white hover:shadow-md">{content}</Link> : <article key={card.key} className="rounded-xl border border-slate-200/80 bg-white/76 p-4 shadow-sm">{content}</article>;
                })}
              </div>
            </section>
          );
        })
      )}

      {data && !data.cards.length && <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><h2 className="font-bold text-slate-900">当前岗位暂无工作台卡片</h2><p className="mt-2 text-sm text-slate-500">拥有投放工作台配置权限的人员可为当前业务范围添加卡片、位置和适用对象。</p></section>}
    </div>
  );
}
