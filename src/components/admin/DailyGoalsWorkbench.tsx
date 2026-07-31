"use client";

import { ChevronLeft, ChevronRight, Search, Target, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type GoalRow = {
  membershipId: string;
  employeeName: string;
  username: string;
  departmentId: string | null;
  departmentName: string;
  isSelf: boolean;
  goal: { targetOrderCount: number; targetAmountCents: number; currency: string; note: string | null } | null;
  actual: { count: number; amountCents: number; currency: string };
};

type Payload = {
  date: string;
  self: GoalRow | null;
  rows: GoalRow[];
  summary: { visibleEmployees: number; goalsSet: number; targetOrderCount: number; targetAmountCents: number; completed: number };
  departments: { id: string; name: string }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type TeamGoalRow = {
  id: string;
  scopeType: "BUSINESS_UNIT" | "DEPARTMENT";
  departmentId: string | null;
  scopeName: string;
  targetOrderCount: number;
  targetAmountCents: number;
  currency: string;
  note: string | null;
  assignedOrderCount: number;
  assignedAmountCents: number;
  actualOrderCount: number;
  actualAmountCents: number;
};

type TeamPayload = {
  date: string;
  canManage: boolean;
  canManageBusinessUnit: boolean;
  departments: { id: string; name: string }[];
  rows: TeamGoalRow[];
};

const today = new Date().toISOString().slice(0, 10);

function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(cents / 100);
}

export default function DailyGoalsWorkbench() {
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Payload | null>(null);
  const [teamData, setTeamData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamEditing, setTeamEditing] = useState(false);
  const [form, setForm] = useState({ targetOrderCount: "0", targetAmount: "0", currency: "EUR", note: "" });
  const [teamForm, setTeamForm] = useState({ scopeType: "BUSINESS_UNIT", departmentId: "", targetOrderCount: "0", targetAmount: "0", currency: "EUR", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ date, page: String(page), pageSize: String(pageSize) });
    if (search.trim()) params.set("search", search.trim());
    if (departmentId) params.set("departmentId", departmentId);
    const [response, teamResponse] = await Promise.all([
      fetch(`/api/mvp/daily-goals?${params}`, { cache: "no-store" }),
      fetch(`/api/mvp/team-goals?date=${date}`, { cache: "no-store" }),
    ]);
    const [result, teamResult] = await Promise.all([
      response.json().catch(() => null),
      teamResponse.json().catch(() => null),
    ]);
    if (!response.ok || !result) setError("目标数据加载失败，请稍后重试。");
    else setData(result);
    if (teamResponse.ok && teamResult) setTeamData(teamResult);
    else setTeamData(null);
    setLoading(false);
  }, [date, departmentId, page, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openEditor(row: GoalRow) {
    setEditing(row);
    setForm({
      targetOrderCount: String(row.goal?.targetOrderCount ?? 0),
      targetAmount: String((row.goal?.targetAmountCents ?? 0) / 100),
      currency: row.goal?.currency ?? "EUR",
      note: row.goal?.note ?? "",
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    const response = await fetch("/api/mvp/daily-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipId: editing.membershipId,
        goalDate: date,
        targetOrderCount: Number(form.targetOrderCount),
        targetAmountCents: Math.round(Number(form.targetAmount) * 100),
        currency: form.currency,
        note: form.note,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(response.status === 403 ? "没有权限为该员工设置目标。" : "保存失败，请检查输入。");
      return;
    }
    setEditing(null);
    await load();
  }

  function openTeamEditor(row?: TeamGoalRow) {
    const defaultScope = teamData?.canManageBusinessUnit ? "BUSINESS_UNIT" : "DEPARTMENT";
    const defaultDepartmentId = teamData?.departments[0]?.id ?? "";
    setTeamForm({
      scopeType: row?.scopeType ?? defaultScope,
      departmentId: row?.departmentId ?? (defaultScope === "DEPARTMENT" ? defaultDepartmentId : ""),
      targetOrderCount: String(row?.targetOrderCount ?? 0),
      targetAmount: String((row?.targetAmountCents ?? 0) / 100),
      currency: row?.currency ?? "EUR",
      note: row?.note ?? "",
    });
    setTeamEditing(true);
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/mvp/team-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalDate: date,
        scopeType: teamForm.scopeType,
        departmentId: teamForm.scopeType === "DEPARTMENT" ? teamForm.departmentId : null,
        targetOrderCount: Number(teamForm.targetOrderCount),
        targetAmountCents: Math.round(Number(teamForm.targetAmount) * 100),
        currency: teamForm.currency,
        note: teamForm.note,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(response.status === 403 ? "没有权限设置该团队目标。" : "团队目标保存失败，请检查输入。");
      return;
    }
    setTeamEditing(false);
    await load();
  }

  const summary = data?.summary;
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-amber-700">目标与协作</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">团队今日目标</h1>
            <p className="mt-1 text-sm text-slate-500">员工看本人，上级按汇报线和授权范围逐级查看。</p>
          </div>
          <input aria-label="目标日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
        </div>
      </header>

      {data?.self && (
        <section className="rounded-2xl border border-amber-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-semibold text-amber-700">我的今日目标</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                {data.self.goal ? `${data.self.goal.targetOrderCount} 单 · ${money(data.self.goal.targetAmountCents, data.self.goal.currency)}` : "今天还没有填写目标"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                已完成 {data.self.actual.count} 单 · {money(data.self.actual.amountCents, data.self.actual.currency)}
              </p>
            </div>
            <Button type="button" size="lg" onClick={() => openEditor(data.self!)}>
              {data.self.goal ? "调整我的目标" : "填写我的今日目标"}
            </Button>
          </div>
        </section>
      )}

      {teamData && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold text-violet-700">团队目标</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">团队目标与个人目标分配</h2>
              <p className="mt-1 text-xs text-slate-500">团队总目标独立设置，同时对照已分配个人目标和实际完成。</p>
            </div>
            {teamData.canManage && (
              <Button type="button" variant="secondary" onClick={() => openTeamEditor()}>
                设置团队目标
              </Button>
            )}
          </div>
          {teamData.rows.length ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {teamData.rows.map((row) => {
                const rate = row.targetOrderCount ? Math.round(row.actualOrderCount / row.targetOrderCount * 100) : 0;
                const unassigned = Math.max(0, row.targetOrderCount - row.assignedOrderCount);
                return (
                  <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-bold text-slate-900">{row.scopeName}</p><p className="text-xs text-slate-500">{row.scopeType === "BUSINESS_UNIT" ? "业务板块目标" : "部门目标"}</p></div>
                      {teamData.canManage && <Button type="button" variant="ghost" size="sm" onClick={() => openTeamEditor(row)}>调整</Button>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-slate-400">团队目标</p><p className="mt-1 font-bold">{row.targetOrderCount} 单</p></div>
                      <div><p className="text-xs text-slate-400">已分配</p><p className="mt-1 font-bold">{row.assignedOrderCount} 单</p></div>
                      <div><p className="text-xs text-slate-400">未分配</p><p className={`mt-1 font-bold ${unassigned ? "text-amber-700" : "text-emerald-700"}`}>{unassigned} 单</p></div>
                      <div><p className="text-xs text-slate-400">实际 / 达成率</p><p className="mt-1 font-bold">{row.actualOrderCount} 单 · {rate}%</p></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">目标金额 {money(row.targetAmountCents, row.currency)} · 已分配 {money(row.assignedAmountCents, row.currency)} · 实际 {money(row.actualAmountCents, row.currency)}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              尚未设置团队目标{teamData.canManage ? "，可点击右上角开始设置。" : "。"}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["可见员工", summary?.visibleEmployees ?? 0, "人"],
          ["已设定目标", summary?.goalsSet ?? 0, "人"],
          ["目标单数", summary?.targetOrderCount ?? 0, "单"],
          ["目标金额", money(summary?.targetAmountCents ?? 0), ""],
          ["已达成人数", summary?.completed ?? 0, "人"],
        ].map(([label, value, unit]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}<span className="ml-1 text-xs font-medium text-slate-400">{unit}</span></p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_120px]">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3">
            <Search size={16} className="text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索员工、账号或部门" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select aria-label="部门筛选" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1); }} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
            <option value="">全部部门</option>
            {data?.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          <select aria-label="每页数量" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} 条/页</option>)}
          </select>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">员工</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">目标</th><th className="px-4 py-3">实际完成</th><th className="px-4 py-3">达成率</th><th className="px-4 py-3 text-right">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">正在加载目标数据…</td></tr>
              ) : !data?.rows.length ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">当前范围内暂无员工</td></tr>
              ) : data.rows.map((row) => {
                const rate = row.goal?.targetOrderCount ? Math.round(row.actual.count / row.goal.targetOrderCount * 100) : 0;
                return (
                  <tr key={row.membershipId} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.employeeName}{row.isSelf && <span className="ml-2 text-xs text-amber-700">本人</span>}</p><p className="text-xs text-slate-400">{row.username}</p></td>
                    <td className="px-4 py-3 text-slate-600">{row.departmentName}</td>
                    <td className="px-4 py-3">{row.goal ? <><p>{row.goal.targetOrderCount} 单</p><p className="text-xs text-slate-400">{money(row.goal.targetAmountCents, row.goal.currency)}</p></> : <span className="text-amber-700">未设置</span>}</td>
                    <td className="px-4 py-3"><p>{row.actual.count} 单</p><p className="text-xs text-slate-400">{money(row.actual.amountCents, row.actual.currency)}</p></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rate >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{rate}%</span></td>
                    <td className="px-4 py-3 text-right"><Button type="button" variant="outline" size="sm" onClick={() => openEditor(row)}>{row.goal ? "调整目标" : "设置目标"}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>共 {data?.pagination.total ?? 0} 人，第 {data?.pagination.page ?? 1}/{data?.pagination.totalPages ?? 1} 页</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="icon" aria-label="上一页" disabled={(data?.pagination.page ?? 1) <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="下一页" disabled={(data?.pagination.page ?? 1) >= (data?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></Button>
          </div>
        </footer>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="personal-goal-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">设置目标</p><h2 id="personal-goal-title" className="mt-1 text-xl font-bold">{editing.employeeName}</h2><p className="text-sm text-slate-500">{editing.departmentName} · {date}</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setEditing(null)}><X size={18} /></Button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">目标单数<input required min="0" max="100000" type="number" value={form.targetOrderCount} onChange={(event) => setForm({ ...form, targetOrderCount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
              <label className="text-sm font-medium text-slate-700">目标金额<input required min="0" step="0.01" type="number" value={form.targetAmount} onChange={(event) => setForm({ ...form, targetAmount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
              <label className="text-sm font-medium text-slate-700">币种<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3">{["EUR", "USD", "PLN", "CZK", "RON"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">备注<textarea maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            </div>
            <Button disabled={saving} size="lg" className="mt-5 w-full"><Target size={17} />{saving ? "保存中…" : "保存目标"}</Button>
          </form>
        </div>
      )}

      {teamEditing && teamData && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={saveTeam} role="dialog" aria-modal="true" aria-labelledby="team-goal-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-semibold text-violet-700">团队目标</p><h2 id="team-goal-title" className="mt-1 text-xl font-bold">设置团队今日目标</h2><p className="text-sm text-slate-500">{date}</p></div>
              <Button type="button" variant="ghost" size="icon" aria-label="关闭团队目标" onClick={() => setTeamEditing(false)}><X size={18} /></Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">目标范围
                <select value={teamForm.scopeType} onChange={(event) => setTeamForm({ ...teamForm, scopeType: event.target.value, departmentId: "" })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3">
                  {teamData.canManageBusinessUnit && <option value="BUSINESS_UNIT">当前业务板块</option>}
                  {teamData.departments.length > 0 && <option value="DEPARTMENT">指定部门</option>}
                </select>
              </label>
              {teamForm.scopeType === "DEPARTMENT" && (
                <label className="text-sm font-medium text-slate-700">部门
                  <select required value={teamForm.departmentId} onChange={(event) => setTeamForm({ ...teamForm, departmentId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3">
                    <option value="">请选择部门</option>{teamData.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm font-medium text-slate-700">团队目标单数<input required min="0" type="number" value={teamForm.targetOrderCount} onChange={(event) => setTeamForm({ ...teamForm, targetOrderCount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
              <label className="text-sm font-medium text-slate-700">团队目标金额<input required min="0" step="0.01" type="number" value={teamForm.targetAmount} onChange={(event) => setTeamForm({ ...teamForm, targetAmount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
              <label className="text-sm font-medium text-slate-700">币种<select value={teamForm.currency} onChange={(event) => setTeamForm({ ...teamForm, currency: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3">{["EUR", "USD", "PLN", "CZK", "RON"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">说明<textarea maxLength={500} value={teamForm.note} onChange={(event) => setTeamForm({ ...teamForm, note: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            </div>
            <Button disabled={saving} variant="secondary" size="lg" className="mt-5 w-full"><Target size={17} />{saving ? "保存中…" : "保存团队目标"}</Button>
          </form>
        </div>
      )}
    </div>
  );
}
