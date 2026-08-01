"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardPenLine,
  FilePenLine,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type ReportStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "LOCKED";
type MetricValueType = "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";

type MetricDefinition = {
  id: string;
  code: string;
  name: string;
  valueType: MetricValueType;
  calculation: "DIRECT" | "RATIO";
  numeratorMetricCode: string | null;
  denominatorMetricCode: string | null;
  multiplier: string | null;
  inputRequired: boolean;
  isActive: boolean;
  sortOrder: number;
};

type CalculatedMetric = {
  id: string;
  code: string;
  name: string;
  valueType: MetricValueType;
  calculation: "DIRECT" | "RATIO";
  valueCents: string | null;
  valueDecimal: string | null;
  isDerived: boolean;
};

type Source = { id: string; code: string; name: string };
type Owner = { membershipId: string; name: string; username: string };

type ReportRow = {
  id: string;
  reportDate: string;
  marketCode: string | null;
  currency: string;
  note: string | null;
  status: ReportStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  lockedAt: string | null;
  returnReason: string | null;
  source: Source;
  product: { id: string; code: string; name: string } | null;
  department: { id: string; name: string } | null;
  owner: Owner;
  reviewer: { membershipId: string | null; name: string | null } | null;
  locker: { membershipId: string | null; name: string | null } | null;
  metrics: CalculatedMetric[];
  canEdit?: boolean;
  canReview?: boolean;
};

type PageMeta = { page: number; pageSize: number; total: number; pageCount: number };
type ConfigPayload = {
  sources?: Array<Source & { isActive?: boolean }>;
  metrics?: MetricDefinition[];
};

type FiltersFromApi = {
  sources?: Source[];
  owners?: Owner[];
};

type Editor = {
  report?: ReportRow;
  sourceId: string;
  reportDate: string;
  marketCode: string;
  currency: string;
  note: string;
  values: Record<string, string>;
};

const statusMeta: Record<ReportStatus, { label: string; active: string; quiet: string }> = {
  DRAFT: { label: "草稿", active: "border-slate-400 bg-slate-900 text-white", quiet: "border-slate-200 bg-slate-50 text-slate-700" },
  SUBMITTED: { label: "待核对", active: "border-amber-500 bg-amber-500 text-white", quiet: "border-amber-200 bg-amber-50 text-amber-800" },
  RETURNED: { label: "退回修改", active: "border-rose-500 bg-rose-500 text-white", quiet: "border-rose-200 bg-rose-50 text-rose-700" },
  LOCKED: { label: "已锁定", active: "border-emerald-600 bg-emerald-600 text-white", quiet: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const reportStatuses: ReportStatus[] = ["DRAFT", "SUBMITTED", "RETURNED", "LOCKED"];
const today = new Date().toISOString().slice(0, 10);

function parseSummary(value: string | null) {
  if (!value) return {} as Partial<Record<ReportStatus, number>>;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      reportStatuses
        .filter((status) => typeof parsed[status] === "number")
        .map((status) => [status, Number(parsed[status])]),
    ) as Partial<Record<ReportStatus, number>>;
  } catch {
    return {} as Partial<Record<ReportStatus, number>>;
  }
}

function apiMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message) return error.message;
  }
  return fallback;
}

function centsText(value: string) {
  const matched = /^(-?)(\d+)$/.exec(value);
  if (!matched) return null;
  const [, sign, digits] = matched;
  const padded = digits.padStart(3, "0");
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function formatMetric(metric: Pick<CalculatedMetric, "valueType" | "valueCents" | "valueDecimal">, currency = "") {
  if (metric.valueCents != null) {
    const amount = centsText(metric.valueCents);
    return amount ? `${currency ? `${currency} ` : ""}${amount}` : "—";
  }
  if (metric.valueDecimal == null || metric.valueDecimal === "") return "—";
  if (metric.valueType === "PERCENT") return `${metric.valueDecimal}%`;
  return metric.valueDecimal;
}

function inputValueFromMetric(metric: CalculatedMetric) {
  if (metric.valueCents != null) {
    return centsText(metric.valueCents) ?? "";
  }
  return metric.valueDecimal ?? "";
}

function localDateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("zh-CN", { hour12: false });
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function uniqueOwners(rows: Owner[]) {
  return [...new Map(rows.map((row) => [row.membershipId, row])).values()];
}

export default function MarketingReportsWorkbench({
  canCreate,
  canUpdate,
  canSubmit,
  canReview,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const [status, setStatus] = useState<ReportStatus | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState(today.slice(0, 8) + "01");
  const [dateTo, setDateTo] = useState(today);
  const [sourceId, setSourceId] = useState("");
  const [ownerMembershipId, setOwnerMembershipId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ page: 1, pageSize: 20, total: 0, pageCount: 0 });
  const [summary, setSummary] = useState<Partial<Record<ReportStatus, number>>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState<{ report: ReportRow; action: "RETURN" | "LOCK" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const activeDefinitions = useMemo(
    () => definitions.filter((definition) => definition.isActive).sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code)),
    [definitions],
  );
  const directDefinitions = useMemo(() => activeDefinitions.filter((definition) => definition.calculation === "DIRECT"), [activeDefinitions]);
  const derivedDefinitions = useMemo(() => activeDefinitions.filter((definition) => definition.calculation === "RATIO"), [activeDefinitions]);

  const reportParams = useCallback((includeStatus: boolean) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (includeStatus && status !== "ALL") params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sourceId) params.set("sourceId", sourceId);
    if (ownerMembershipId) params.set("ownerMembershipId", ownerMembershipId);
    if (search.trim()) params.set("search", search.trim());
    return params;
  }, [dateFrom, dateTo, ownerMembershipId, page, pageSize, search, sourceId, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const mainParams = reportParams(true);
    const summaryParams = reportParams(false);
    try {
      const requests: [Promise<Response>, Promise<Response>, Promise<Response> | null] = [
        fetch(`/api/mvp/marketing/reports?${mainParams.toString()}`, { cache: "no-store" }),
        fetch("/api/mvp/marketing/config", { cache: "no-store" }),
        status === "ALL" ? null : fetch(`/api/mvp/marketing/reports?${summaryParams.toString()}`, { cache: "no-store" }),
      ];
      const [reportResponse, configResponse, summaryResponse] = await Promise.all([requests[0], requests[1], requests[2]]);
      const [reportPayload, configPayload, summaryPayload] = await Promise.all([
        reportResponse.json().catch(() => null),
        configResponse.json().catch(() => null),
        summaryResponse?.json().catch(() => null) ?? Promise.resolve(null),
      ]);
      if (!reportResponse.ok) throw new Error(apiMessage(reportPayload, "日报数据加载失败，请稍后重试。"));

      const payloadData = reportPayload?.data;
      const rows = Array.isArray(payloadData) ? payloadData : Array.isArray(payloadData?.items) ? payloadData.items : [];
      const payloadMeta = reportPayload?.meta ?? payloadData?.meta;
      const responseFilters: FiltersFromApi = reportPayload?.filters ?? payloadData?.filters ?? {};
      setReports(rows as ReportRow[]);
      setMeta({
        page: Number(payloadMeta?.page ?? page),
        pageSize: Number(payloadMeta?.pageSize ?? pageSize),
        total: Number(payloadMeta?.total ?? rows.length),
        pageCount: Number(payloadMeta?.pageCount ?? (rows.length ? 1 : 0)),
      });

      const nextSummary = summaryResponse
        ? (summaryPayload?.summary ?? summaryPayload?.data?.summary ?? parseSummary(summaryResponse.headers.get("x-marketing-summary")))
        : (reportPayload?.summary ?? payloadData?.summary ?? parseSummary(reportResponse.headers.get("x-marketing-summary")));
      setSummary(nextSummary as Partial<Record<ReportStatus, number>>);

      const config = configResponse.ok ? (configPayload?.data ?? configPayload ?? {}) as ConfigPayload : {};
      const nextSources = uniqueById([
        ...(config.sources?.filter((item) => item.isActive !== false) ?? []),
        ...(responseFilters.sources ?? []),
        ...(rows as ReportRow[]).map((row) => row.source),
      ]);
      setSources(nextSources);
      setDefinitions((config.metrics ?? []).map((metric) => ({ ...metric, multiplier: metric.multiplier ?? null })));
      setOwners((current) => uniqueOwners([
        ...current,
        ...(responseFilters.owners ?? []),
        ...(rows as ReportRow[]).map((row) => row.owner),
      ]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "日报数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, reportParams, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetPage() {
    setPage(1);
  }

  function openNewReport() {
    setEditor({
      sourceId: sources[0]?.id ?? "",
      reportDate: dateTo || today,
      marketCode: "",
      currency: "EUR",
      note: "",
      values: {},
    });
  }

  function openEditReport(report: ReportRow) {
    const values: Record<string, string> = {};
    for (const definition of directDefinitions) {
      const metric = report.metrics.find((item) => item.id === definition.id);
      if (metric) values[definition.id] = inputValueFromMetric(metric);
    }
    setEditor({
      report,
      sourceId: report.source.id,
      reportDate: report.reportDate,
      marketCode: report.marketCode ?? "",
      currency: report.currency,
      note: report.note ?? "",
      values,
    });
  }

  async function saveReport(submit: boolean) {
    if (!editor) return;
    if (!editor.sourceId) {
      setError("请先选择投放数据源。若没有可选项，请由有配置权限的人员先新增数据源。");
      return;
    }
    setSaving(true);
    setError("");
    const values = directDefinitions
      .map((definition) => ({ metricDefinitionId: definition.id, value: editor.values[definition.id]?.trim() ?? "" }))
      .filter((item) => item.value);
    try {
      const response = await fetch("/api/mvp/marketing/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: editor.sourceId,
          reportDate: editor.reportDate,
          marketCode: editor.marketCode.trim() || null,
          currency: editor.currency.trim().toUpperCase(),
          note: editor.note.trim() || null,
          values,
          submit,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(payload, "日报保存失败，请检查填写内容。"));
      setEditor(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "日报保存失败，请检查填写内容。");
    } finally {
      setSaving(false);
    }
  }

  function beginReview(report: ReportRow, action: "RETURN" | "LOCK") {
    setReviewing({ report, action });
    setReviewReason("");
  }

  async function submitReview() {
    if (!reviewing) return;
    if (reviewing.action === "RETURN" && !reviewReason.trim()) {
      setError("退回日报时请说明需要修改的内容。");
      return;
    }
    setReviewSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/mvp/marketing/reports/${reviewing.report.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: reviewing.action, reason: reviewReason.trim() || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(payload, "审核操作失败，请刷新后重试。"));
      setReviewing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审核操作失败，请刷新后重试。");
    } finally {
      setReviewSaving(false);
    }
  }

  const currentPageCount = Math.max(1, meta.pageCount || 1);
  const editable = (row: ReportRow) => Boolean(row.canEdit ?? (row.status === "DRAFT" || row.status === "RETURNED"));

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-slate-950 via-[#3b2b08] to-amber-800 p-6 text-white shadow-lg shadow-amber-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-amber-200">投放运营 · 日报中心</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">投放日报与核对</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/85">员工只填写原始事实；系统统一计算比例。日报可保存草稿、提交核对、退回修改和锁定，全程保留操作记录。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="border-white/30 bg-white/10 text-white hover:border-white/50 hover:bg-white/20 hover:text-white" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新
            </Button>
            {canCreate && <Button type="button" onClick={openNewReport}><Plus size={17} />填写今日日报</Button>}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold text-amber-700">日报状态</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">先筛选，再处理</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setStatus("ALL"); resetPage(); }} className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${status === "ALL" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"}`}>
              全部 <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5 text-xs">{Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0) || meta.total}</span>
            </button>
            {reportStatuses.map((item) => (
              <button key={item} type="button" onClick={() => { setStatus(item); resetPage(); }} className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${status === item ? statusMeta[item].active : statusMeta[item].quiet}`}>
                {statusMeta[item].label}<span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-xs">{summary[item] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter size={16} className="text-amber-700" />筛选当前授权范围内的日报</div>
        <div className="grid gap-3 lg:grid-cols-6">
          <label className="text-xs font-medium text-slate-500">开始日期<input aria-label="开始日期" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); resetPage(); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
          <label className="text-xs font-medium text-slate-500">结束日期<input aria-label="结束日期" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); resetPage(); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
          <label className="text-xs font-medium text-slate-500">投放来源<select aria-label="投放来源筛选" value={sourceId} onChange={(event) => { setSourceId(event.target.value); resetPage(); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="">全部来源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-500">销售/投手<select aria-label="销售或投手筛选" value={ownerMembershipId} onChange={(event) => { setOwnerMembershipId(event.target.value); resetPage(); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="">全部可见员工</option>{owners.map((owner) => <option key={owner.membershipId} value={owner.membershipId}>{owner.name || owner.username}</option>)}</select></label>
          <label className="flex items-end"><span className="sr-only">搜索</span><span className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={16} className="text-slate-400" /><input aria-label="搜索日报" value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="来源、员工、市场" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></span></label>
          <label className="text-xs font-medium text-slate-500">每页显示<select aria-label="每页显示数量" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPage(); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} 条</option>)}</select></label>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-col justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center"><span>{error}</span><Button type="button" size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-100" onClick={() => void load()}>重试</Button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">日报列表</h2><p className="mt-1 text-xs text-slate-500">排序固定为日报日期、最后更新时间、记录编号；翻页由服务端执行。</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">共 {meta.total} 条</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">日期 / 状态</th><th className="px-4 py-3">销售 / 部门</th><th className="px-4 py-3">投放来源</th><th className="px-4 py-3">市场</th><th className="px-4 py-3">原始指标</th><th className="px-4 py-3">退回 / 核对</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-amber-600" size={20} />正在加载日报…</td></tr> : reports.length === 0 ? <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500"><ClipboardPenLine className="mx-auto mb-2 text-slate-300" size={28} />当前筛选范围内暂无日报{canCreate ? "，可以从右上角开始填写。" : "。"}</td></tr> : reports.map((report) => (
                <tr key={report.id} className="align-top transition hover:bg-amber-50/35">
                  <td className="px-4 py-3"><p className="font-semibold text-slate-950">{report.reportDate}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusMeta[report.status].quiet}`}>{statusMeta[report.status].label}</span></td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{report.owner.name || report.owner.username}</p><p className="mt-1 text-xs text-slate-400">{report.department?.name ?? "未归属部门"}</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{report.source.name}</p><p className="mt-1 font-mono text-xs text-slate-400">{report.source.code}</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{report.marketCode || "—"}</p><p className="mt-1 text-xs text-slate-400">{report.currency}</p></td>
                  <td className="max-w-[300px] px-4 py-3"><div className="flex flex-wrap gap-1.5">{report.metrics.filter((metric) => !metric.isDerived).slice(0, 4).map((metric) => <span key={metric.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{metric.name} <b className="ml-1 text-slate-950">{formatMetric(metric, metric.valueType === "MONEY_CENTS" ? report.currency : "")}</b></span>)}{report.metrics.filter((metric) => !metric.isDerived).length > 4 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">+{report.metrics.filter((metric) => !metric.isDerived).length - 4}</span>}</div>{report.note && <p className="mt-2 line-clamp-1 text-xs text-slate-500">备注：{report.note}</p>}</td>
                  <td className="max-w-[250px] px-4 py-3">{report.status === "RETURNED" ? <><p className="font-medium text-rose-700">需修改</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-rose-600">{report.returnReason || "未填写退回原因"}</p></> : report.status === "LOCKED" ? <><p className="font-medium text-emerald-700">已锁定</p><p className="mt-1 text-xs text-slate-500">{report.locker?.name || report.reviewer?.name || "已核对"} · {localDateTime(report.lockedAt)}</p></> : report.status === "SUBMITTED" ? <><p className="font-medium text-amber-800">等待核对</p><p className="mt-1 text-xs text-slate-500">提交于 {localDateTime(report.submittedAt)}</p></> : <p className="text-xs text-slate-500">尚未提交</p>}</td>
                  <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{editable(report) && <Button type="button" size="sm" variant="outline" onClick={() => openEditReport(report)}><FilePenLine size={14} />编辑</Button>}{canReview && report.status === "SUBMITTED" && (report.canReview ?? true) && <><Button type="button" size="sm" variant="warning" onClick={() => beginReview(report, "RETURN")}><Undo2 size={14} />退回</Button><Button type="button" size="sm" variant="success" onClick={() => beginReview(report, "LOCK")}><ShieldCheck size={14} />锁定</Button></>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center"><span>第 {meta.page}/{currentPageCount} 页 · 每页 {meta.pageSize} 条 · 共 {meta.total} 条</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={loading || meta.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={15} />上一页</Button><span className="min-w-16 text-center font-semibold text-slate-700">{meta.page} / {currentPageCount}</span><Button type="button" size="sm" variant="ghost" disabled={loading || meta.page >= currentPageCount} onClick={() => setPage((current) => current + 1)}>下一页<ArrowRight size={15} /></Button></div></footer>
      </section>

      {editor && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={(event) => { event.preventDefault(); void saveReport(false); }} role="dialog" aria-modal="true" aria-labelledby="marketing-report-title" className="mx-auto my-5 w-full max-w-5xl rounded-2xl bg-white shadow-2xl"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 md:flex-row md:items-start"><div><p className="text-xs font-semibold tracking-[0.14em] text-amber-700">一页完成录入</p><h2 id="marketing-report-title" className="mt-1 text-2xl font-bold text-slate-950">{editor.report ? "编辑投放日报" : "填写投放日报"}</h2><p className="mt-1 text-sm text-slate-500">只填写原始指标；比例、成本率等衍生数据由系统计算，不能手工覆盖。</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭日报表单" onClick={() => setEditor(null)}><X size={19} /></Button></header><div className="space-y-5 p-5"><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700">投放来源<span className="ml-1 text-rose-600">*</span><select required value={editor.sourceId} onChange={(event) => setEditor({ ...editor, sourceId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">请选择数据源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.code}</option>)}</select></label><label className="text-sm font-medium text-slate-700">日报日期<span className="ml-1 text-rose-600">*</span><input required type="date" value={editor.reportDate} onChange={(event) => setEditor({ ...editor, reportDate: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="text-sm font-medium text-slate-700">市场/国家<input maxLength={20} value={editor.marketCode} onChange={(event) => setEditor({ ...editor, marketCode: event.target.value.toUpperCase() })} placeholder="例如 PL、ES" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="text-sm font-medium text-slate-700">币种<span className="ml-1 text-rose-600">*</span><input required minLength={3} maxLength={3} value={editor.currency} onChange={(event) => setEditor({ ...editor, currency: event.target.value.toUpperCase() })} placeholder="EUR" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm uppercase" /></label></section><section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><div className="flex items-start gap-3"><ClipboardPenLine className="mt-0.5 text-amber-700" size={19} /><div><h3 className="font-bold text-slate-900">原始指标</h3><p className="mt-1 text-xs leading-5 text-slate-600">金额请按正常金额填写（例如 299.90），系统会安全换算成最小货币单位；不使用浏览器浮点金额。</p></div></div>{directDefinitions.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-amber-300 bg-white px-4 py-5 text-sm text-amber-900">当前业务范围还没有启用可填写的原始指标。请由有投放配置权限的人员先完成指标设置。</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{directDefinitions.map((definition) => <label key={definition.id} className="rounded-xl border border-amber-100 bg-white p-3 text-sm font-medium text-slate-800"><span className="flex items-center justify-between gap-2"><span>{definition.name}{definition.inputRequired && <em className="ml-1 not-italic text-rose-600">*</em>}</span><span className="font-mono text-[11px] font-normal text-slate-400">{definition.code}</span></span><input required={definition.inputRequired} inputMode="decimal" value={editor.values[definition.id] ?? ""} onChange={(event) => setEditor({ ...editor, values: { ...editor.values, [definition.id]: event.target.value } })} placeholder={definition.valueType === "MONEY_CENTS" ? "例如 299.90" : definition.valueType === "PERCENT" ? "例如 2.5" : "输入数值"} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /><span className="mt-2 block text-xs text-slate-400">{definition.valueType === "MONEY_CENTS" ? `金额（${editor.currency || "币种"}）` : definition.valueType === "PERCENT" ? "百分比数值" : definition.valueType === "COUNT" ? "数量" : "小数"}</span></label>)}</div>}</section>{derivedDefinitions.length > 0 && <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold text-slate-900">系统计算指标</h3><p className="mt-1 text-xs text-slate-500">以下指标由后端使用本次原始事实计算并保存，不能人工填写。</p><div className="mt-3 flex flex-wrap gap-2">{derivedDefinitions.map((definition) => <span key={definition.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{definition.name} <span className="ml-1 font-normal text-slate-400">{definition.numeratorMetricCode} ÷ {definition.denominatorMetricCode}</span></span>)}</div></section>}<label className="block text-sm font-medium text-slate-700">工作备注（可选）<textarea value={editor.note} maxLength={2000} onChange={(event) => setEditor({ ...editor, note: event.target.value })} placeholder="例如异常原因、素材测试结论、下一步计划" className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>{editor.report?.status === "RETURNED" && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">上次退回原因：{editor.report.returnReason || "未填写"}</p>}</div><footer className="flex flex-col-reverse justify-between gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center"><p className="text-xs leading-5 text-slate-500">保存草稿后仍可修改；提交后进入核对队列。被锁定的日报不能再由录入人修改。</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditor(null)}>取消</Button><Button type="submit" disabled={saving || !(editor.report ? canUpdate : canCreate)} variant="outline"><Save size={16} />{saving ? "保存中…" : "保存草稿"}</Button>{canSubmit && <Button type="button" disabled={saving || !(editor.report ? canUpdate : canCreate) || directDefinitions.length === 0} onClick={() => void saveReport(true)}><Send size={16} />{saving ? "提交中…" : "提交核对"}</Button>}</div></footer></form></div>}

      {reviewing && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4"><section role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">日报核对</p><h2 id="review-dialog-title" className="mt-1 text-xl font-bold text-slate-950">{reviewing.action === "LOCK" ? "确认并锁定日报" : "退回日报修改"}</h2><p className="mt-1 text-sm text-slate-500">{reviewing.report.owner.name || reviewing.report.owner.username} · {reviewing.report.source.name} · {reviewing.report.reportDate}</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭核对对话框" onClick={() => setReviewing(null)}><X size={18} /></Button></div>{reviewing.action === "LOCK" ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"><CheckCircle2 className="mr-2 inline-block align-text-bottom" size={17} />锁定后，录入人不能再修改这份日报；如确需修正，应由后续的受控流程处理。</div> : <label className="mt-5 block text-sm font-medium text-slate-700">退回原因<span className="ml-1 text-rose-600">*</span><textarea required value={reviewReason} maxLength={1000} onChange={(event) => setReviewReason(event.target.value)} placeholder="明确告诉员工需要补充或修改什么" className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setReviewing(null)}>取消</Button><Button type="button" disabled={reviewSaving} variant={reviewing.action === "LOCK" ? "success" : "warning"} onClick={() => void submitReview()}>{reviewing.action === "LOCK" ? <ShieldCheck size={16} /> : <Undo2 size={16} />}{reviewSaving ? "处理中…" : reviewing.action === "LOCK" ? "确认锁定" : "退回修改"}</Button></div></section></div>}
    </div>
  );
}
