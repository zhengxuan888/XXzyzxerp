"use client";

import { BarChart3, CalendarDays, Plus, RefreshCw, Target, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type MetricType = "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";

type MetricDefinition = {
  id: string;
  code: string;
  name: string;
  valueType: MetricType;
  aggregation: "SUM" | "AVG" | "LAST";
  calculation: "DIRECT" | "RATIO";
  numeratorMetricCode: string | null;
  denominatorMetricCode: string | null;
  multiplier: string | null;
  inputRequired: boolean;
  showOnWorkbench: boolean;
  sortOrder: number;
  isActive: boolean;
};

type CalculatedMetric = {
  id: string;
  code: string;
  name: string;
  valueType: MetricType;
  calculation: "DIRECT" | "RATIO";
  valueCents: string | null;
  valueDecimal: string | null;
  isDerived: boolean;
};

type KpiTarget = {
  id: string;
  metric: { code: string; name: string; valueType: MetricType };
  scopeType: "BUSINESS_UNIT" | "DEPARTMENT" | "MEMBERSHIP";
  department: { name: string } | null;
  membership: { id: string | null; name: string; username: string } | null;
  periodStart: string;
  periodEnd: string;
  actualPeriodStart: string;
  actualPeriodEnd: string;
  targetCents: string | null;
  targetDecimal: string | null;
  actualCents: string | null;
  actualDecimal: string | null;
  achievementPercent: string | null;
  reportCount: number;
  currency: string;
  note: string | null;
};

type KpiPayload = {
  dateFrom: string;
  dateTo: string;
  summaries: Array<{ currency: string; reportCount: number; metrics: CalculatedMetric[] }>;
  metricDefinitions: MetricDefinition[];
  targets: KpiTarget[];
  scopeOptions: {
    businessUnit: boolean;
    departments: Array<{ id: string; name: string }>;
    memberships: Array<{ id: string; name: string; username: string; departmentId: string | null }>;
  };
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

function money(value: string | null, currency: string) {
  if (value == null) return "—";
  const matched = /^(-?)(\d+)$/.exec(value);
  if (!matched) return "—";
  const [, sign, digits] = matched;
  const padded = digits.padStart(3, "0");
  return `${sign}${currency} ${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function decimal(value: string | null, suffix = "") {
  if (value == null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number)}${suffix}`;
}

function displayMetric(metric: Pick<CalculatedMetric, "valueType" | "valueCents" | "valueDecimal">, currency: string) {
  if (metric.valueType === "MONEY_CENTS") return money(metric.valueCents, currency);
  if (metric.valueType === "PERCENT") return decimal(metric.valueDecimal, "%");
  return decimal(metric.valueDecimal);
}

function scopeLabel(target: KpiTarget) {
  if (target.scopeType === "BUSINESS_UNIT") return "当前业务板块";
  if (target.scopeType === "DEPARTMENT") return target.department?.name ?? "部门";
  return target.membership?.name || target.membership?.username || "员工";
}

function targetValue(target: KpiTarget) {
  return target.metric.valueType === "MONEY_CENTS"
    ? money(target.targetCents, target.currency)
    : target.metric.valueType === "PERCENT"
      ? decimal(target.targetDecimal, "%")
      : decimal(target.targetDecimal);
}

function actualValue(target: KpiTarget) {
  return target.metric.valueType === "MONEY_CENTS"
    ? money(target.actualCents, target.currency)
    : target.metric.valueType === "PERCENT"
      ? decimal(target.actualDecimal, "%")
      : decimal(target.actualDecimal);
}

export default function MarketingKpisWorkbench({ canManage }: { canManage: boolean }) {
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<KpiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    metricDefinitionId: "",
    scopeType: "BUSINESS_UNIT" as "BUSINESS_UNIT" | "DEPARTMENT" | "MEMBERSHIP",
    departmentId: "",
    membershipId: "",
    periodStart: monthStart,
    periodEnd: today,
    value: "",
    currency: "EUR",
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ dateFrom, dateTo });
    const response = await fetch(`/api/mvp/marketing/kpis?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError(result?.error?.message ?? "KPI 数据加载失败，请稍后重试。");
      setData(null);
    } else {
      setData(result.data as KpiPayload);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleSummaries = useMemo(
    () => data?.summaries.map((summary) => ({ ...summary, metrics: summary.metrics.filter((metric) => data.metricDefinitions.find((definition) => definition.id === metric.id)?.showOnWorkbench) })) ?? [],
    [data],
  );
  const completedTargetCount = data?.targets.filter((target) => Number(target.achievementPercent ?? 0) >= 100).length ?? 0;
  const attentionTargetCount = data?.targets.filter((target) => target.achievementPercent != null && Number(target.achievementPercent) < 70).length ?? 0;

  function openEditor() {
    const defaultScope = data?.scopeOptions.businessUnit
      ? "BUSINESS_UNIT"
      : data?.scopeOptions.departments.length
        ? "DEPARTMENT"
        : "MEMBERSHIP";
    setForm({
      metricDefinitionId: data?.metricDefinitions[0]?.id ?? "",
      scopeType: defaultScope,
      departmentId: data?.scopeOptions.departments[0]?.id ?? "",
      membershipId: data?.scopeOptions.memberships[0]?.id ?? "",
      periodStart: dateFrom,
      periodEnd: dateTo,
      value: "",
      currency: data?.summaries[0]?.currency ?? "EUR",
      note: "",
    });
    setEditing(true);
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/mvp/marketing/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metricDefinitionId: form.metricDefinitionId,
        scopeType: form.scopeType,
        departmentId: form.scopeType === "DEPARTMENT" ? form.departmentId : null,
        membershipId: form.scopeType === "MEMBERSHIP" ? form.membershipId : null,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        value: form.value,
        currency: form.currency,
        note: form.note,
      }),
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !result?.ok) {
      setError(result?.error?.message ?? "保存 KPI 目标失败，请检查输入与权限。");
      return;
    }
    setEditing(false);
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-amber-700">投放运营 · 团队与 KPI</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">目标、实际与团队达成</h1>
            <p className="mt-1 text-sm text-slate-500">只汇总当前业务上下文和被授权范围内的已提交日报；比率先汇总原始数据再计算。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><CalendarDays size={15} /><span className="sr-only">开始日期</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="bg-transparent outline-none" /></label>
            <span className="text-slate-300">至</span>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><span className="sr-only">结束日期</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="bg-transparent outline-none" /></label>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</Button>
            {canManage && <Button type="button" size="sm" onClick={openEditor}><Plus size={15} />设置 KPI</Button>}
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["已提交日报", data?.summaries.reduce((sum, item) => sum + item.reportCount, 0) ?? 0, "份"],
          ["当前 KPI 目标", data?.targets.length ?? 0, "项"],
          ["已达标", completedTargetCount, "项"],
          ["需要关注", attentionTargetCount, "项"],
        ].map(([label, value, unit], index) => (
          <article key={String(label)} className={`rounded-2xl border bg-white p-4 shadow-sm ${index === 3 && attentionTargetCount ? "border-amber-300" : "border-slate-200"}`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}<span className="ml-1 text-xs font-medium text-slate-400">{unit}</span></p>
          </article>
        ))}
      </section>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">正在汇总当前授权范围内的投放数据…</section>
      ) : !data ? null : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><BarChart3 size={18} className="text-amber-700" /><div><h2 className="font-bold text-slate-950">本期数据概览</h2><p className="text-xs text-slate-500">多币种不混算；请分别查看各币种的原始事实和系统计算指标。</p></div></div>
            {!visibleSummaries.length ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">本期当前范围内还没有已提交日报。</div>
            ) : (
              <div className="mt-4 space-y-4">
                {visibleSummaries.map((summary) => (
                  <div key={summary.currency} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">{summary.currency} · {summary.reportCount} 份日报</p><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">按原始数据加权计算</span></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {summary.metrics.map((metric) => (
                        <div key={metric.id} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">{metric.name}</p>
                          <p className="mt-1 text-lg font-bold text-slate-950">{displayMetric(metric, summary.currency)}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{metric.isDerived ? "系统计算" : "原始汇总"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold text-amber-700">目标闭环</p><h2 className="mt-1 text-lg font-bold text-slate-950">KPI 目标与实际达成</h2><p className="mt-1 text-xs text-slate-500">每一项仅按目标范围匹配实际日报，不将不同团队或币种混在一起。</p></div>{canManage && <Button type="button" variant="outline" onClick={openEditor}><Target size={16} />新增/调整目标</Button>}</div>
            {!data.targets.length ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">当前范围尚未设置 KPI 目标{canManage ? "，可从右上角开始设置。" : "。"}</div>
            ) : (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {data.targets.map((target) => {
                  const rate = Math.max(0, Math.min(100, Number(target.achievementPercent ?? 0)));
                  const rateText = target.achievementPercent == null ? "—" : `${decimal(target.achievementPercent)}%`;
                  return (
                    <article key={target.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{target.metric.name}</p><p className="mt-1 text-xs text-slate-500">{scopeLabel(target)} · {target.periodStart} 至 {target.periodEnd}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(target.achievementPercent ?? 0) >= 100 ? "bg-emerald-50 text-emerald-700" : Number(target.achievementPercent ?? 0) < 70 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{rateText}</span></div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-slate-400">目标</p><p className="mt-1 font-bold text-slate-900">{targetValue(target)}</p></div><div><p className="text-xs text-slate-400">实际</p><p className="mt-1 font-bold text-slate-900">{actualValue(target)}</p></div><div><p className="text-xs text-slate-400">参与日报</p><p className="mt-1 font-bold text-slate-900">{target.reportCount} 份</p></div></div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${rate >= 100 ? "bg-emerald-500" : rate < 70 ? "bg-amber-500" : "bg-slate-700"}`} style={{ width: `${rate}%` }} /></div>
                      <p className="mt-3 text-xs text-slate-500">实际统计范围：{target.actualPeriodStart} 至 {target.actualPeriodEnd}{target.note ? ` · ${target.note}` : ""}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={saveTarget} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-amber-700">KPI 配置</p><h2 className="mt-1 text-xl font-bold text-slate-950">设置目标范围与目标值</h2><p className="mt-1 text-sm text-slate-500">只能选择当前账号被授权管理的业务范围。</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setEditing(false)}><X size={18} /></Button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>指标</span><select required value={form.metricDefinitionId} onChange={(event) => setForm((current) => ({ ...current, metricDefinitionId: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-amber-500">{data?.metricDefinitions.map((metric) => <option key={metric.id} value={metric.id}>{metric.name}（{metric.code}）</option>)}</select></label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>目标范围</span><select value={form.scopeType} onChange={(event) => setForm((current) => ({ ...current, scopeType: event.target.value as typeof current.scopeType }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-amber-500">{data?.scopeOptions.businessUnit && <option value="BUSINESS_UNIT">当前业务板块</option>}{data?.scopeOptions.departments.length ? <option value="DEPARTMENT">指定部门</option> : null}{data?.scopeOptions.memberships.length ? <option value="MEMBERSHIP">指定员工</option> : null}</select></label>
              {form.scopeType === "DEPARTMENT" && <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>部门</span><select required value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-amber-500">{data?.scopeOptions.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
              {form.scopeType === "MEMBERSHIP" && <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>员工</span><select required value={form.membershipId} onChange={(event) => setForm((current) => ({ ...current, membershipId: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-amber-500">{data?.scopeOptions.memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.name}（{membership.username}）</option>)}</select></label>}
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>开始日期</span><input required type="date" value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-amber-500" /></label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>结束日期</span><input required type="date" value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-amber-500" /></label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>目标值</span><input required inputMode="decimal" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} placeholder="例如 300 或 12.5" className="h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-amber-500" /></label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>币种</span><input required maxLength={3} value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 font-normal uppercase outline-none focus:border-amber-500" /></label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>说明（可选）</span><textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} maxLength={1000} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-amber-500" placeholder="例如：本月团队消耗目标" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>取消</Button><Button type="submit" disabled={saving || !form.metricDefinitionId || !form.value}>{saving ? "保存中…" : "保存 KPI 目标"}</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}
