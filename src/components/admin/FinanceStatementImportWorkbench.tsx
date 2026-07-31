"use client";

import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileSpreadsheet,
  FileUp,
  Loader2,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type FinanceStatementImportCapabilities = {
  canReadTemplates: boolean;
  canManageTemplates: boolean;
  canReadImports: boolean;
  canPreviewImports: boolean;
  canConfirmImports: boolean;
  canCancelImports: boolean;
  canReadArtifacts: boolean;
  canReadCounterparties: boolean;
};

type PageMeta = { page: number; pageSize: number; total: number; pageCount: number };
type ApiEnvelope<T> = { ok: boolean; data?: T; meta?: PageMeta; error?: { code?: string; message?: string } };

type Counterparty = { id: string; code: string; name: string; type: string; isActive: boolean };

type Template = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  configuration: unknown;
  counterpartyId: string | null;
  version: number;
  isActive: boolean;
  updatedAt: string;
};

type ImportRow = {
  id: string;
  rowNumber: number;
  status: "READY" | "WARNING" | "REJECTED" | "IMPORTED" | "SKIPPED";
  issueCodes: unknown;
  message: string | null;
  sourceReference: string | null;
  trackingReference: string | null;
  description: string | null;
  amountLabel: string | null;
};

type ImportSheet = {
  id: string;
  sheetKey: string;
  sheetName: string;
  headerRowNumber: number;
  statementNo: string;
  statementType: string;
  currency: string;
  totalAmountLabel: string;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
  importedRows: number;
  createdStatementId: string | null;
  rows: ImportRow[];
};

type ImportBatch = {
  id: string;
  template: Pick<Template, "id" | "code" | "name"> | null;
  counterparty: Pick<Counterparty, "id" | "code" | "name" | "type"> | null;
  statementNoPrefix: string;
  externalReference: string | null;
  sourceFile: { originalName: string; mimeType: string; sizeBytes: number; sha256: string };
  status: "PREVIEWED" | "IMPORTING" | "IMPORTED" | "CANCELLED";
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
  importedRows: number;
  previewedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  sheets: ImportSheet[];
  idempotent?: boolean;
};

type TemplateForm = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  counterpartyId: string;
  configuration: string;
};

const emptyMeta: PageMeta = { page: 1, pageSize: 20, total: 0, pageCount: 1 };

const templateExample = JSON.stringify(
  {
    sheets: [
      {
        key: "statement_lines",
        sheetAliases: ["Sheet1"],
        headerScanRows: 12,
        dataStartOffset: 1,
        skipIfFirstCellMatches: ["合计", "总计"],
        statementType: "COD_REMITTANCE",
        currency: "EUR",
        currencyScale: 2,
        aliases: {
          sourceReference: ["业务单号"],
          trackingReference: ["物流单号"],
          amount: ["金额"],
          description: ["说明"],
        },
      },
    ],
  },
  null,
  2,
);

function statusClass(status: string) {
  if (status === "IMPORTED" || status === "READY") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "REJECTED" || status === "CANCELLED") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "WARNING" || status === "IMPORTING") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PREVIEWED: "已预检，待人工确认",
    IMPORTING: "正在确认导入",
    IMPORTED: "已生成草稿结算单",
    CANCELLED: "已取消",
    READY: "可导入",
    WARNING: "需要人工处理",
    REJECTED: "预检未通过",
    SKIPPED: "已跳过",
  };
  return labels[status] ?? status;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    COD_REMITTANCE: "COD 回款",
    SHIPPING_FEE: "运输费用",
    WAREHOUSE_FEE: "仓储费用",
    RETURN_FEE: "退件费用",
    OTHER: "其他",
  };
  return labels[type] ?? type;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PageMeta }> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? "操作失败，请稍后重试。");
  }
  return { data: payload.data, meta: payload.meta };
}

function Pager({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return (
    <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>共 {meta.total} 条，第 {meta.page}/{Math.max(meta.pageCount, 1)} 页</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label="上一页" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><ChevronLeft size={16} /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="下一页" disabled={meta.page >= meta.pageCount} onClick={() => onPage(meta.page + 1)}><ChevronRight size={16} /></Button>
      </div>
    </footer>
  );
}

export default function FinanceStatementImportWorkbench({ capabilities }: { capabilities: FinanceStatementImportCapabilities }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [batchMeta, setBatchMeta] = useState<PageMeta>(emptyMeta);
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>({ id: null, code: "", name: "", description: "", counterpartyId: "", configuration: templateExample });
  const [uploadForm, setUploadForm] = useState({ templateId: "", counterpartyId: "", statementNoPrefix: "", externalReference: "", periodStart: "", periodEnd: "", issuedAt: "" });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const requests: [Promise<{ data: Template[]; meta?: PageMeta }> | null, Promise<{ data: Counterparty[]; meta?: PageMeta }> | null, Promise<{ data: ImportBatch[]; meta?: PageMeta }> | null] = [
        capabilities.canReadTemplates ? request<Template[]>("/api/mvp/finance/statement-templates?page=1&pageSize=100&active=true") : null,
        capabilities.canReadCounterparties ? request<Counterparty[]>("/api/mvp/finance/counterparties?page=1&pageSize=100&active=true") : null,
        capabilities.canReadImports ? request<ImportBatch[]>(`/api/mvp/finance/statement-imports?page=${batchPage}&pageSize=20`) : null,
      ];
      const [templateResult, counterpartyResult, batchResult] = await Promise.all(requests);
      if (templateResult) setTemplates(templateResult.data);
      if (counterpartyResult) setCounterparties(counterpartyResult.data);
      if (batchResult) {
        setBatches(batchResult.data);
        setBatchMeta(batchResult.meta ?? emptyMeta);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "账单导入数据加载失败。");
    } finally {
      setLoading(false);
    }
  }, [batchPage, capabilities.canReadCounterparties, capabilities.canReadImports, capabilities.canReadTemplates]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedTemplate = useMemo(() => templates.find((item) => item.id === uploadForm.templateId) ?? null, [templates, uploadForm.templateId]);
  const canConfirmSelected = Boolean(
    selectedBatch
    && selectedBatch.status === "PREVIEWED"
    && selectedBatch.readyRows > 0
    && selectedBatch.warningRows === 0
    && selectedBatch.rejectedRows === 0
    && capabilities.canConfirmImports,
  );
  const canCancelSelected = Boolean(selectedBatch && selectedBatch.status === "PREVIEWED" && capabilities.canCancelImports);

  function resetTemplateForm() {
    setTemplateForm({ id: null, code: "", name: "", description: "", counterpartyId: "", configuration: templateExample });
    setShowTemplateForm(false);
  }

  function editTemplate(template: Template) {
    setTemplateForm({
      id: template.id,
      code: template.code,
      name: template.name,
      description: template.description ?? "",
      counterpartyId: template.counterpartyId ?? "",
      configuration: JSON.stringify(template.configuration, null, 2),
    });
    setShowTemplateForm(true);
    setError("");
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capabilities.canManageTemplates) return;
    setSaving(true);
    setError("");
    try {
      let configuration: unknown;
      try {
        configuration = JSON.parse(templateForm.configuration);
      } catch {
        throw new Error("模板配置必须是有效的 JSON。请修正后再保存。");
      }
      const payload = {
        code: templateForm.code,
        name: templateForm.name,
        description: templateForm.description,
        counterpartyId: templateForm.counterpartyId || null,
        configuration,
      };
      if (templateForm.id) {
        await request<Template>(`/api/mvp/finance/statement-templates/${templateForm.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        setNotice("模板已更新并升级版本；历史预检批次仍使用原来的模板快照。");
      } else {
        await request<Template>("/api/mvp/finance/statement-templates", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        setNotice("账单模板已创建。请先用一份脱敏样本做预检确认。");
      }
      resetTemplateForm();
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存模板失败。");
    } finally {
      setSaving(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    if (next && !/\.(xlsx|xltx)$/i.test(next.name)) {
      setFile(null);
      setError("请上传 .xlsx 或 .xltx 文件；旧式 .xls 请先在 Excel 中另存为 .xlsx。");
      event.target.value = "";
      return;
    }
    setFile(next);
    setError("");
  }

  async function previewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capabilities.canPreviewImports) return;
    if (!file) {
      setError("请先选择账单工作簿。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      Object.entries(uploadForm).forEach(([key, value]) => formData.set(key, value));
      formData.set("file", file);
      const result = await request<ImportBatch>("/api/mvp/finance/statement-imports/preview", { method: "POST", body: formData });
      setSelectedBatch(result.data);
      setCancelReason("");
      setNotice(result.data.idempotent ? "这是同一来源文件的已有预检批次，未重复创建。" : "预检完成。系统尚未创建结算单、未对账、未付款，请先人工复核。 ");
      setFile(null);
      await load();
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "账单预检失败。");
    } finally {
      setSaving(false);
    }
  }

  async function openBatch(batchId: string) {
    setSaving(true);
    setError("");
    try {
      const result = await request<ImportBatch>(`/api/mvp/finance/statement-imports/${batchId}`);
      setSelectedBatch(result.data);
      setCancelReason("");
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "账单预检详情加载失败。");
    } finally {
      setSaving(false);
    }
  }

  async function confirmImport() {
    if (!selectedBatch || !canConfirmSelected) return;
    if (!window.confirm("确认后会创建草稿结算单和明细；不会自动对账、审批、过账或付款。是否继续？")) return;
    setSaving(true);
    setError("");
    try {
      const result = await request<ImportBatch>(`/api/mvp/finance/statement-imports/${selectedBatch.id}/confirm`, { method: "POST" });
      setSelectedBatch(result.data);
      setNotice(result.data.idempotent ? "该预检批次此前已确认，未重复生成结算单。" : "账单已导入为草稿结算单；下一步由财务按独立权限完成对账与审批。");
      await load();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "确认导入失败。不会产生半成品结算单。");
    } finally {
      setSaving(false);
    }
  }

  async function cancelImport() {
    if (!selectedBatch || !canCancelSelected) return;
    if (!cancelReason.trim()) {
      setError("请先填写取消预检的原因，方便后续复核与重新预检。");
      return;
    }
    if (!window.confirm("取消后不会删除原始文件或预检记录，但本批次不能恢复；修正后请重新上传并预检。是否继续？")) return;
    setSaving(true);
    setError("");
    try {
      const result = await request<ImportBatch>(`/api/mvp/finance/statement-imports/${selectedBatch.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      setSelectedBatch(result.data);
      setCancelReason("");
      setNotice(result.data.idempotent ? "该预检已取消；历史记录和原件仍按权限保留。" : "预检已取消并保留审计记录。修正后可重新上传同一文件预检。");
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "取消预检失败。请刷新后重试。");
    } finally {
      setSaving(false);
    }
  }

  function downloadArtifact() {
    if (!selectedBatch || !capabilities.canReadArtifacts) return;
    window.open(`/api/mvp/finance/statement-imports/${selectedBatch.id}/artifact`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"><FileSpreadsheet size={14} /> 财务结算 / 模板导入</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">账单模板与人工确认导入</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">模板只描述表头和字段规则；上传后先私有预检，只有具备确认权限的人才能生成草稿结算单。不会自动对账、过账或付款。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-3"><strong className="block text-lg text-emerald-700">{batches.reduce((sum, row) => sum + row.readyRows, 0)}</strong><span className="text-slate-500">本页可导入行</span></div>
            <div className="rounded-2xl border border-amber-100 bg-white px-3 py-3"><strong className="block text-lg text-amber-700">{batches.reduce((sum, row) => sum + row.warningRows, 0)}</strong><span className="text-slate-500">待处理提示</span></div>
            <div className="rounded-2xl border border-rose-100 bg-white px-3 py-3"><strong className="block text-lg text-rose-700">{batches.reduce((sum, row) => sum + row.rejectedRows, 0)}</strong><span className="text-slate-500">未通过行</span></div>
          </div>
        </div>
      </section>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><CircleAlert className="mt-0.5 shrink-0" size={17} />{error}</div> : null}
      {notice ? <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={17} />{notice}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-bold text-slate-900">上传账单并预检</h2><p className="mt-1 text-xs text-slate-500">仅接受 .xlsx / .xltx；无法识别、公式或精度风险会阻止确认。</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</Button>
          </div>
          {!capabilities.canPreviewImports ? <div className="m-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">当前账号可以查看，但没有“账单预检”动作权限。</div> : null}
          <form className="space-y-4 p-5" onSubmit={(event) => void previewImport(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">账单模板
                <select required disabled={!capabilities.canPreviewImports || saving} value={uploadForm.templateId} onChange={(event) => setUploadForm((value) => ({ ...value, templateId: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100">
                  <option value="">请选择已启用模板</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.code} · {template.name}（v{template.version}）</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">结算对象
                <select required disabled={!capabilities.canPreviewImports || saving} value={uploadForm.counterpartyId} onChange={(event) => setUploadForm((value) => ({ ...value, counterpartyId: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100">
                  <option value="">请选择已启用结算对象</option>
                  {counterparties.map((counterparty) => <option key={counterparty.id} value={counterparty.id}>{counterparty.code} · {counterparty.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">结算单号前缀
                <input required maxLength={80} placeholder="例如 HY-20260731" value={uploadForm.statementNoPrefix} onChange={(event) => setUploadForm((value) => ({ ...value, statementNoPrefix: event.target.value }))} disabled={!capabilities.canPreviewImports || saving} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">外部参考号 <span className="font-normal text-slate-400">（可选）</span>
                <input maxLength={160} value={uploadForm.externalReference} onChange={(event) => setUploadForm((value) => ({ ...value, externalReference: event.target.value }))} disabled={!capabilities.canPreviewImports || saving} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">账单开始日期 <span className="font-normal text-slate-400">（可选）</span><input type="date" value={uploadForm.periodStart} onChange={(event) => setUploadForm((value) => ({ ...value, periodStart: event.target.value }))} disabled={!capabilities.canPreviewImports || saving} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">账单结束日期 <span className="font-normal text-slate-400">（可选）</span><input type="date" value={uploadForm.periodEnd} onChange={(event) => setUploadForm((value) => ({ ...value, periodEnd: event.target.value }))} disabled={!capabilities.canPreviewImports || saving} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" /></label>
            </div>
            <label className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-4 text-sm text-slate-700 transition hover:border-amber-500 hover:bg-amber-50">
              <span className="rounded-xl bg-amber-100 p-2 text-amber-700"><FileUp size={20} /></span>
              <span className="min-w-0 flex-1"><strong className="block truncate">{file ? file.name : "选择账单工作簿"}</strong><span className="mt-0.5 block text-xs text-slate-500">仅私有保存用于审计；文件不对外发送。支持 .xlsx、.xltx。</span></span>
              <span className="text-xs font-semibold text-amber-800">浏览文件</span>
              <input type="file" accept=".xlsx,.xltx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.spreadsheetml.template" className="sr-only" onChange={onFileChange} disabled={!capabilities.canPreviewImports || saving} />
            </label>
            {selectedTemplate ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">将按 <strong>{selectedTemplate.code}</strong> 的 v{selectedTemplate.version} 模板快照预检；后续修改模板不会改变本次结果。</p> : null}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"><Button type="submit" disabled={!capabilities.canPreviewImports || saving || !file}><Upload size={16} />{saving ? "正在预检…" : "开始私有预检"}</Button><span className="text-xs text-slate-500">预检通过 ≠ 已入账。必须在右侧详细确认后才会生成草稿。</span></div>
          </form>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ShieldCheck className="text-emerald-600" size={19} /><h2 className="font-bold text-slate-900">安全门禁</h2></div>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li><strong className="mr-2 text-slate-900">1.</strong>模板、结算对象与当前公司/业务板块/部门范围必须匹配。</li>
            <li><strong className="mr-2 text-slate-900">2.</strong>表头歧义、无效金额、公式和可能丢失精度的单号不会静默导入。</li>
            <li><strong className="mr-2 text-slate-900">3.</strong>同一结算对象与源文件哈希不能重复生成账单。</li>
            <li><strong className="mr-2 text-slate-900">4.</strong>确认只生成 <b>草稿结算单</b>；对账、审批、过账和付款仍需要各自权限。</li>
          </ol>
        </aside>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">账单模板</h2><p className="mt-1 text-xs text-slate-500">所有表头、工作表及字段映射由模板配置，不绑定任何物流商或国家。</p></div>{capabilities.canManageTemplates ? <Button type="button" size="sm" onClick={() => { setShowTemplateForm(true); setTemplateForm((value) => value.id ? { id: null, code: "", name: "", description: "", counterpartyId: "", configuration: templateExample } : value); }}><FileSpreadsheet size={15} />新增模板</Button> : null}</div>
        {showTemplateForm ? <form className="m-5 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4" onSubmit={(event) => void submitTemplate(event)}>
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{templateForm.id ? "编辑账单模板" : "新增账单模板"}</h3><p className="mt-1 text-xs text-slate-600">映射规则是数据配置，不执行脚本、公式或自动关联订单。</p></div><Button type="button" variant="ghost" size="sm" onClick={resetTemplateForm}>收起</Button></div>
          <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">模板编码<input required disabled={Boolean(templateForm.id) || saving} maxLength={64} value={templateForm.code} onChange={(event) => setTemplateForm((value) => ({ ...value, code: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">模板名称<input required disabled={saving} maxLength={160} value={templateForm.name} onChange={(event) => setTemplateForm((value) => ({ ...value, name: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">限定结算对象 <span className="font-normal text-slate-400">（不选则可复用）</span><select disabled={saving} value={templateForm.counterpartyId} onChange={(event) => setTemplateForm((value) => ({ ...value, counterpartyId: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">不限定</option>{counterparties.map((counterparty) => <option key={counterparty.id} value={counterparty.id}>{counterparty.code} · {counterparty.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">模板说明 <span className="font-normal text-slate-400">（可选）</span><input disabled={saving} maxLength={1000} value={templateForm.description} onChange={(event) => setTemplateForm((value) => ({ ...value, description: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label></div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">配置 JSON<textarea required spellCheck={false} disabled={saving} value={templateForm.configuration} onChange={(event) => setTemplateForm((value) => ({ ...value, configuration: event.target.value }))} className="min-h-72 rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" /></label>
          <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}{templateForm.id ? "保存并升级版本" : "保存模板"}</Button><Button type="button" variant="outline" onClick={resetTemplateForm} disabled={saving}>取消</Button></div>
        </form> : null}
        <div className="divide-y divide-slate-100">{loading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />正在读取模板…</div> : templates.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">暂无可用模板。请由有“模板管理”权限的人先创建规则。</div> : templates.map((template) => <article key={template.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{template.name}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{template.code}</span><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${template.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>{template.isActive ? "已启用" : "已停用"}</span></div><p className="mt-1 text-xs text-slate-500">v{template.version} · {template.description || "未填写说明"}{template.counterpartyId ? " · 已限定结算对象" : " · 可复用模板"}</p></div>{capabilities.canManageTemplates ? <Button type="button" variant="outline" size="sm" onClick={() => editTemplate(template)}><PencilLine size={15} />编辑规则</Button> : null}</article>)}</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">预检历史</h2><p className="mt-1 text-xs text-slate-500">点开一条记录后才能查看逐行结果与确认入口。</p></div><Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} />刷新</Button></div><div className="divide-y divide-slate-100">{loading ? <div className="p-8 text-center text-sm text-slate-500">正在读取…</div> : batches.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">暂无预检记录。</div> : batches.map((batch) => <button type="button" key={batch.id} onClick={() => void openBatch(batch.id)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-amber-50/50 md:grid-cols-[minmax(0,1fr)_auto]"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{batch.sourceFile.originalName}</strong><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${statusClass(batch.status)}`}>{statusLabel(batch.status)}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{batch.counterparty?.name ?? "结算对象"} · {batch.template?.name ?? "模板"} · {batch.statementNoPrefix}</span></span><span className="grid grid-cols-3 gap-3 text-center text-xs"><span><b className="block text-emerald-700">{batch.readyRows}</b>可导</span><span><b className="block text-amber-700">{batch.warningRows}</b>提示</span><span><b className="block text-rose-700">{batch.rejectedRows}</b>拒绝</span></span></button>)}</div><Pager meta={batchMeta} onPage={setBatchPage} /></div>

        <aside className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">预检详情</h2><p className="mt-1 text-xs text-slate-500">逐行展示，不会显示存储路径或后台密钥。</p></div>{selectedBatch ? <span className={`rounded-full px-2 py-1 text-xs ring-1 ${statusClass(selectedBatch.status)}`}>{statusLabel(selectedBatch.status)}</span> : null}</div>{!selectedBatch ? <div className="p-8 text-center text-sm text-slate-500">选择左侧预检记录，或上传一份工作簿开始。</div> : <div className="space-y-4 p-5"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm text-slate-900">{selectedBatch.sourceFile.originalName}</strong><span className="mt-1 block text-xs text-slate-500">{selectedBatch.counterparty?.name ?? "—"} · {selectedBatch.template?.name ?? "—"}</span></div>{capabilities.canReadArtifacts ? <Button type="button" variant="outline" size="sm" onClick={downloadArtifact}>下载原件</Button> : null}</div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><div><dt>可导入</dt><dd className="font-semibold text-emerald-700">{selectedBatch.readyRows} 行</dd></div><div><dt>未通过</dt><dd className="font-semibold text-rose-700">{selectedBatch.rejectedRows} 行</dd></div><div><dt>人工提示</dt><dd className="font-semibold text-amber-700">{selectedBatch.warningRows} 行</dd></div><div><dt>已导入</dt><dd className="font-semibold text-slate-900">{selectedBatch.importedRows} 行</dd></div></dl></div>
          {selectedBatch.sheets.map((sheet) => <details key={sheet.id} open className="rounded-2xl border border-slate-200"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm"><span><strong>{sheet.sheetName}</strong><span className="ml-2 text-xs text-slate-500">第 {sheet.headerRowNumber} 行表头 · {typeLabel(sheet.statementType)} · {sheet.totalAmountLabel}</span></span><ChevronDown size={16} /></summary><div className="border-t border-slate-100"><div className="max-h-80 overflow-auto"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">行</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">业务单号 / 运单</th><th className="px-3 py-2">金额</th></tr></thead><tbody>{sheet.rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-3 py-2 text-slate-500">{row.rowNumber}</td><td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 ring-1 ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>{row.message ? <p className="mt-1 max-w-52 text-rose-700">{row.message}</p> : null}</td><td className="px-3 py-2 text-slate-700"><span className="block">{row.sourceReference || "—"}</span><span className="block text-slate-400">{row.trackingReference || ""}</span></td><td className="px-3 py-2 text-slate-700">{row.amountLabel || "—"}</td></tr>)}</tbody></table></div>{sheet.createdStatementId ? <p className="border-t border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">已生成草稿结算单。对账、审批和过账仍由财务流程控制。</p> : null}</div></details>)}
          {selectedBatch.status === "CANCELLED" ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900"><strong className="block text-sm">该预检已取消</strong><p className="mt-1">取消时间：{formatDateTime(selectedBatch.cancelledAt)}</p><p className="mt-1">取消原因：{selectedBatch.cancellationReason || "—"}</p><p className="mt-2 text-rose-800">原始文件和预检记录仍按权限保留；若已修正，请在左侧重新上传并预检。</p></div> : null}
          {selectedBatch.status === "PREVIEWED" ? <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4"><label className="grid gap-1.5 text-xs font-semibold text-rose-900">取消预检原因<textarea value={cancelReason} maxLength={500} disabled={!canCancelSelected || saving} onChange={(event) => setCancelReason(event.target.value)} placeholder="例如：模板表头与物流商新版本不一致，修正后重新预检" className="min-h-20 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-100" /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs leading-5 text-rose-800">取消不会删除原件；同一文件可在修正模板后重新预检。</span><Button type="button" variant="destructive" size="sm" onClick={() => void cancelImport()} disabled={!canCancelSelected || saving || !cancelReason.trim()}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Ban size={15} />}取消预检</Button></div>{!capabilities.canCancelImports ? <p className="mt-2 text-xs text-rose-800">当前账号没有“取消账单预检”动作权限。</p> : null}</div> : null}
          {selectedBatch.status !== "CANCELLED" ? <><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">确认动作是不可逆的业务事实：系统会把当前预检行原子生成草稿结算单；任何一行异常、提示或权限不足都会阻止确认。</div><Button type="button" variant="success" className="w-full" onClick={() => void confirmImport()} disabled={!canConfirmSelected || saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}{selectedBatch.status === "IMPORTED" ? "已确认导入" : !capabilities.canConfirmImports ? "没有确认导入权限" : selectedBatch.warningRows || selectedBatch.rejectedRows ? "存在预检问题，不能确认" : "确认生成草稿结算单"}</Button></> : null}
        </div>}</aside>
      </section>
    </div>
  );
}
