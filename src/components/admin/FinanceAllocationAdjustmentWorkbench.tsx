"use client";

import {
  ArrowLeftRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export type FinanceAllocationAdjustmentCapabilities = {
  canRead: boolean;
  canRequest: boolean;
  canApprove: boolean;
  canApply: boolean;
  canCancel: boolean;
};

type PageMeta = { page: number; pageSize: number; total: number; pageCount: number };
type ApiEnvelope<T> = { ok: boolean; data?: T; meta?: PageMeta; error?: { code?: string; message?: string } };
type AdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "APPLIED";
type AdjustmentCommand = "approve" | "reject" | "cancel" | "apply";

type Adjustment = {
  id: string;
  status: AdjustmentStatus;
  amountCents: string;
  amountLabel: string;
  reason: string;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  appliedAt: string | null;
  replacementAllocationId: string | null;
  source: {
    allocationId: string;
    paymentId: string;
    paymentNo: string;
    paymentStatus: string;
    statementId: string;
    statementNo: string;
    statementStatus: string;
    effectiveAmountCents: string;
  };
  replacement: { statementId: string; statementNo: string; statementStatus: string };
};

type AdjustableAllocation = {
  id: string;
  amountCents: string;
  amountLabel: string;
  payment: { id: string; paymentNo: string };
  statement: { id: string; statementNo: string };
};

type ReplacementStatement = {
  id: string;
  statementNo: string;
  totalAmountCents: string;
  totalAmountLabel: string;
  availableAmountCents: string;
  availableAmountLabel: string;
  canCoverAdjustment: boolean;
};

const emptyMeta: PageMeta = { page: 1, pageSize: 20, total: 0, pageCount: 1 };

const statusLabel: Record<AdjustmentStatus, string> = {
  PENDING: "待审核",
  APPROVED: "待执行",
  REJECTED: "已驳回",
  CANCELLED: "已取消",
  APPLIED: "已执行",
};

function statusClass(status: AdjustmentStatus) {
  if (status === "APPLIED") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "APPROVED") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "PENDING") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function localTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function idempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `adjustment-${crypto.randomUUID()}`;
  return `adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PageMeta }> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? "操作未完成，请稍后重试。");
  }
  return { data: payload.data, meta: payload.meta };
}

function Pager({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>共 {meta.total} 条，第 {meta.page}/{Math.max(meta.pageCount, 1)} 页</span>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon" variant="ghost" aria-label="上一页" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><ChevronLeft size={16} /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label="下一页" disabled={meta.page >= meta.pageCount} onClick={() => onPage(meta.page + 1)}><ChevronRight size={16} /></Button>
      </div>
    </footer>
  );
}

export default function FinanceAllocationAdjustmentWorkbench({ capabilities }: { capabilities: FinanceAllocationAdjustmentCapabilities }) {
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [meta, setMeta] = useState(emptyMeta);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [candidateRows, setCandidateRows] = useState<AdjustableAllocation[]>([]);
  const [candidateMeta, setCandidateMeta] = useState(emptyMeta);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [requestTarget, setRequestTarget] = useState<AdjustableAllocation | null>(null);
  const [replacementRows, setReplacementRows] = useState<ReplacementStatement[]>([]);
  const [replacementMeta, setReplacementMeta] = useState(emptyMeta);
  const [replacementPage, setReplacementPage] = useState(1);
  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [selectedReplacement, setSelectedReplacement] = useState<ReplacementStatement | null>(null);
  const [requestForm, setRequestForm] = useState({ replacementStatementId: "", reason: "", idempotencyKey: "" });

  const [actionTarget, setActionTarget] = useState<{ row: Adjustment; command: AdjustmentCommand } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const result = await request<Adjustment[]>(`/api/mvp/finance/allocation-adjustments?${params}`);
      setRows(result.data);
      setMeta(result.meta ?? emptyMeta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "核销调整队列加载失败。");
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  const loadCandidates = useCallback(async () => {
    if (!capabilities.canRequest) {
      setCandidateRows([]);
      return;
    }
    setCandidateLoading(true);
    try {
      const params = new URLSearchParams({ page: String(candidatePage), pageSize: "10" });
      if (candidateQuery.trim()) params.set("q", candidateQuery.trim());
      const result = await request<AdjustableAllocation[]>(`/api/mvp/finance/adjustable-allocations?${params}`);
      setCandidateRows(result.data);
      setCandidateMeta(result.meta ?? emptyMeta);
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : "可调整核销加载失败。");
    } finally {
      setCandidateLoading(false);
    }
  }, [candidatePage, candidateQuery, capabilities.canRequest]);

  const loadReplacementOptions = useCallback(async (allocationId: string, nextPage: number, nextQuery: string) => {
    setReplacementLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "10" });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const result = await request<ReplacementStatement[]>(`/api/mvp/finance/payment-allocations/${allocationId}/adjustment-options?${params}`);
      setReplacementRows(result.data);
      setReplacementMeta(result.meta ?? emptyMeta);
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : "替代结算单加载失败。");
      setReplacementRows([]);
      setReplacementMeta(emptyMeta);
    } finally {
      setReplacementLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadQueue(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCandidates(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCandidates]);
  useEffect(() => {
    if (!requestTarget) return undefined;
    const timer = window.setTimeout(() => { void loadReplacementOptions(requestTarget.id, replacementPage, replacementQuery); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReplacementOptions, replacementPage, replacementQuery, requestTarget]);

  function refresh() {
    void loadQueue();
    void loadCandidates();
  }

  function openRequest(row: AdjustableAllocation) {
    setError("");
    setRequestTarget(row);
    setReplacementRows([]);
    setSelectedReplacement(null);
    setReplacementPage(1);
    setReplacementQuery("");
    setRequestForm({ replacementStatementId: "", reason: "", idempotencyKey: idempotencyKey() });
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!requestTarget) return;
    setSaving(true);
    setError("");
    try {
      await request<Adjustment>(`/api/mvp/finance/payment-allocations/${requestTarget.id}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestForm),
      });
      setRequestTarget(null);
      setNotice("调整申请已提交，等待具有审核权限的人员处理。");
      refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "调整申请提交失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!actionTarget) return;
    setSaving(true);
    setError("");
    try {
      await request<Adjustment>(`/api/mvp/finance/allocation-adjustments/${actionTarget.row.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: actionTarget.command, reason: actionReason }),
      });
      const copy: Record<AdjustmentCommand, string> = { approve: "已批准，等待独立执行。", reject: "申请已驳回。", cancel: "申请已取消。", apply: "调整已执行，原核销保持不可变并追加了冲销事实。" };
      setNotice(copy[actionTarget.command]);
      setActionTarget(null);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败。");
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = rows.filter((row) => row.status === "PENDING").length;
  const approvedCount = rows.filter((row) => row.status === "APPROVED").length;
  const appliedCount = rows.filter((row) => row.status === "APPLIED").length;
  const replacementOptions = selectedReplacement && !replacementRows.some((row) => row.id === selectedReplacement.id)
    ? [selectedReplacement, ...replacementRows]
    : replacementRows;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-amber-900 px-5 py-5 text-white">
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-300">FINANCE · FOUR-EYE · AUDIT</p>
          <h1 className="mt-1 text-2xl font-bold">核销调整</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">原核销不允许直接删除或改写。已批准的调整由独立人员执行，系统追加冲销事实和替代核销，并全程保留审计记录。</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            { label: "本页待审核", value: pendingCount, Icon: Clock3, tone: "text-sky-700 bg-sky-50" },
            { label: "本页待执行", value: approvedCount, Icon: ShieldCheck, tone: "text-amber-800 bg-amber-50" },
            { label: "本页已执行", value: appliedCount, Icon: BadgeCheck, tone: "text-emerald-700 bg-emerald-50" },
          ].map(({ label, value, Icon, tone }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><span className={`rounded-lg p-2 ${tone}`}><Icon size={18} /></span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-slate-950">{value}</p></div></div>)}
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><CircleAlert className="mt-0.5 shrink-0" size={17} />{error}</div>}
      {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={17} />{notice}</span><button type="button" className="font-medium underline" onClick={() => setNotice("")}>关闭</button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div><h2 className="font-bold text-slate-950">调整队列</h2><p className="mt-1 text-sm text-slate-500">审核、取消和执行均由独立动作权限和当前数据范围决定。</p></div>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新</Button>
        </div>
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 md:grid-cols-[1fr_180px_auto]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索付款单、原结算单、替代结算单或调整 ID" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
          <select aria-label="筛选调整状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">全部状态</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <Button type="button" variant="outline" onClick={() => { setQuery(""); setStatus(""); setPage(1); }}>重置</Button>
        </div>
        <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">付款 / 原核销</th><th className="px-4 py-3">原结算单 → 替代结算单</th><th className="px-4 py-3">金额 / 原因</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">申请时间</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" size={20} />正在加载调整队列…</td></tr>
            : !rows.length ? <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">当前授权范围内没有核销调整申请。</td></tr>
              : rows.map((row) => <tr key={row.id} className="hover:bg-amber-50/30"><td className="px-4 py-3"><p className="font-semibold text-slate-950">{row.source.paymentNo}</p><p className="mt-1 font-mono text-xs text-slate-400">核销 {row.source.allocationId.slice(0, 10)}…</p></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{row.source.statementNo}</p><p className="mt-1 flex items-center gap-1 text-xs text-amber-800"><ArrowLeftRight size={13} />{row.replacement.statementNo}</p></td><td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.amountLabel}</p><p className="mt-1 max-w-[260px] truncate text-xs text-slate-500" title={row.reason}>{row.reason}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(row.status)}`}>{statusLabel[row.status]}</span>{row.rejectionReason && <p className="mt-1 max-w-[180px] truncate text-xs text-rose-700" title={row.rejectionReason}>驳回：{row.rejectionReason}</p>}{row.cancellationReason && <p className="mt-1 max-w-[180px] truncate text-xs text-slate-500" title={row.cancellationReason}>取消：{row.cancellationReason}</p>}</td><td className="px-4 py-3 text-xs text-slate-500">{localTime(row.requestedAt)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{row.status === "PENDING" && capabilities.canApprove && <><Button type="button" size="sm" onClick={() => { setActionTarget({ row, command: "approve" }); setActionReason(""); }}>批准</Button><Button type="button" size="sm" variant="outline" className="text-rose-700" onClick={() => { setActionTarget({ row, command: "reject" }); setActionReason(""); }}>驳回</Button></>}{["PENDING", "APPROVED"].includes(row.status) && capabilities.canCancel && <Button type="button" size="sm" variant="outline" onClick={() => { setActionTarget({ row, command: "cancel" }); setActionReason(""); }}>取消</Button>}{row.status === "APPROVED" && capabilities.canApply && <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setActionTarget({ row, command: "apply" }); setActionReason(""); }}>执行</Button>}</div></td></tr>)}
        </tbody></table></div>
        <Pager meta={meta} onPage={setPage} />
      </section>

      {capabilities.canRequest && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center"><div><h2 className="font-bold text-slate-950">可申请调整的核销</h2><p className="mt-1 text-sm text-slate-500">只显示仍完整有效且付款、原结算单均为“已批准”的核销；已过账事实不能在这里更正。</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">全额调整 · 不改原记录</span></div>
        <div className="flex gap-3 border-b border-slate-100 bg-slate-50/70 p-4"><label className="relative max-w-xl flex-1"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} /><input value={candidateQuery} onChange={(event) => { setCandidateQuery(event.target.value); setCandidatePage(1); }} placeholder="搜索付款单或结算单" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label></div>
        <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">付款单</th><th className="px-4 py-3">原结算单</th><th className="px-4 py-3">可调整金额</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{candidateLoading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" size={20} /></td></tr> : !candidateRows.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">暂无符合条件的核销。</td></tr> : candidateRows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold text-slate-900">{row.payment.paymentNo}</td><td className="px-4 py-3 text-slate-700">{row.statement.statementNo}</td><td className="px-4 py-3 font-semibold text-slate-900">{row.amountLabel}</td><td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => openRequest(row)}><Undo2 size={15} />申请调整</Button></td></tr>)}</tbody></table></div>
        <Pager meta={candidateMeta} onPage={setCandidatePage} />
      </section>}

      {requestTarget && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><form onSubmit={submitRequest} className="mx-auto my-6 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-semibold text-amber-700">受控全额调整</p><h2 className="mt-1 text-xl font-bold text-slate-950">申请调整核销</h2><p className="mt-1 text-sm text-slate-500">{requestTarget.payment.paymentNo} · {requestTarget.statement.statementNo} · {requestTarget.amountLabel}</p></div><Button type="button" size="icon" variant="ghost" aria-label="关闭申请窗口" onClick={() => setRequestTarget(null)}><X size={18} /></Button></header><div className="space-y-4 p-5"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><FileWarning className="mr-2 inline" size={16} />执行后会保留原核销，并追加冲销效果与替代核销；不能直接删除或修改原记录。</div><label className="block text-sm font-medium">替代结算单<div className="mt-2 flex gap-2"><input value={replacementQuery} onChange={(event) => { setReplacementQuery(event.target.value); setReplacementPage(1); }} placeholder="搜索已批准结算单" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3" /><Button type="button" variant="outline" onClick={() => void loadReplacementOptions(requestTarget.id, 1, replacementQuery)}>搜索</Button></div><select required value={requestForm.replacementStatementId} onChange={(event) => { const next = replacementOptions.find((row) => row.id === event.target.value) ?? null; setSelectedReplacement(next); setRequestForm({ ...requestForm, replacementStatementId: event.target.value }); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3"><option value="">请选择替代结算单</option>{replacementOptions.map((row) => <option key={row.id} value={row.id} disabled={!row.canCoverAdjustment}>{row.statementNo} · 可用 {row.availableAmountLabel}{row.canCoverAdjustment ? "" : "（余额不足）"}</option>)}</select></label>{selectedReplacement && <p className={`rounded-lg px-3 py-2 text-xs ${selectedReplacement.canCoverAdjustment ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>当前选择：{selectedReplacement.statementNo}，可用余额 {selectedReplacement.availableAmountLabel}。{selectedReplacement.canCoverAdjustment ? "执行时仍会再次复核。" : "当前余额不足，不能提交此调整。"}</p>}{replacementLoading ? <p className="text-sm text-slate-500"><Loader2 className="mr-2 inline animate-spin" size={15} />正在读取替代结算单…</p> : <Pager meta={replacementMeta} onPage={setReplacementPage} />}<label className="block text-sm font-medium">调整原因<textarea required minLength={3} maxLength={1000} value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value })} placeholder="说明为什么需要将该核销调整到另一张结算单" className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 p-3" /></label></div><footer className="flex justify-end gap-2 border-t border-slate-200 p-5"><Button type="button" variant="outline" onClick={() => setRequestTarget(null)}>取消</Button><Button type="submit" disabled={saving || replacementLoading || selectedReplacement?.canCoverAdjustment === false}>{saving ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}提交审核</Button></footer></form></div>}

      {actionTarget && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4"><form onSubmit={submitAction} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">受控操作</p><h2 className="mt-1 text-xl font-bold text-slate-950">{({ approve: "批准调整", reject: "驳回调整", cancel: "取消调整", apply: "执行调整" } as Record<AdjustmentCommand, string>)[actionTarget.command]}</h2><p className="mt-1 text-sm text-slate-500">付款单 {actionTarget.row.source.paymentNo} · {actionTarget.row.amountLabel}</p></div><Button type="button" size="icon" variant="ghost" aria-label="关闭" onClick={() => setActionTarget(null)}><X size={18} /></Button></div>{["reject", "cancel"].includes(actionTarget.command) ? <label className="mt-5 block text-sm font-medium">原因<textarea required minLength={3} maxLength={1000} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="请填写处理原因" className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 p-3" /></label> : <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{actionTarget.command === "apply" ? "执行将再次复核替代结算单余额；原核销不会被删除或修改。" : "系统会校验申请人与审核人的岗位分离规则。"}</div>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActionTarget(null)}>返回</Button><Button type="submit" disabled={saving} className={actionTarget.command === "apply" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>{saving ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}确认</Button></div></form></div>}
    </div>
  );
}
