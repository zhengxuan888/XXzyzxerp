"use client";

import type { ClipboardEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FileText,
  FolderCog,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type Category = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type DocumentRow = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
  reviewNote: string | null;
  version: number;
  createdAt: string;
  category: Pick<Category, "id" | "code" | "name"> | null;
  ownerUser: { username: string; fullName: string };
  reviewedByMembership: { id: string; user: { fullName: string; username: string } } | null;
  attachment: { id: string; originalName: string; mimeType: string; extension: string; sizeBytes: number; sha256: string; status: string } | null;
  canReview: boolean;
  canArchive: boolean;
};

type ListResponse = {
  data: DocumentRow[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
  summary: { total: number; pending: number; approved: number; rejected: number };
};

type Capabilities = { canCreate: boolean; canConfigure: boolean };

type ApiPayload = {
  ok?: boolean;
  data?: unknown;
  meta?: ListResponse["meta"];
  summary?: ListResponse["summary"];
  error?: { message?: string };
};

const EMPTY_LIST: ListResponse = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
  summary: { total: 0, pending: 0, approved: 0, rejected: 0 },
};

const statusMeta: Record<DocumentRow["reviewStatus"], { label: string; className: string }> = {
  PENDING_REVIEW: { label: "待审核", className: "border-amber-200 bg-amber-50 text-amber-800" },
  APPROVED: { label: "已通过", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  REJECTED: { label: "已退回", className: "border-rose-200 bg-rose-50 text-rose-800" },
  ARCHIVED: { label: "已归档", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function inputClassName() {
  return "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
}

function selectClassName() {
  return "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
}

function contentUrl(id: string) {
  return `/api/mvp/documents/${id}/content`;
}

function isImage(document: DocumentRow) {
  return document.attachment?.mimeType.startsWith("image/") ?? false;
}

function isPdf(document: DocumentRow) {
  return document.attachment?.mimeType === "application/pdf";
}

function isDocx(document: DocumentRow) {
  return document.attachment?.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

async function jsonPayload(response: Response): Promise<ApiPayload | null> {
  return response.json().catch(() => null) as Promise<ApiPayload | null>;
}

function errorMessage(payload: ApiPayload | null, fallback: string) {
  return payload?.error?.message || fallback;
}

function DocumentActions({
  document,
  onPreview,
  onReview,
  onArchive,
  saving,
  mobile = false,
}: {
  document: DocumentRow;
  onPreview: (document: DocumentRow) => void;
  onReview: (document: DocumentRow) => void;
  onArchive: (document: DocumentRow) => void;
  saving: boolean;
  mobile?: boolean;
}) {
  const size = mobile ? undefined : "sm";
  return (
    <div className={`flex flex-wrap gap-2 ${mobile ? "pt-1" : "justify-end"}`}>
      <Button variant="outline" size={size} onClick={() => onPreview(document)} disabled={!document.attachment}>
        <Eye className="size-3.5" />预览
      </Button>
      {document.canReview && (
        <Button variant="success" size={size} onClick={() => onReview(document)}>
          <CheckCircle2 className="size-3.5" />审核
        </Button>
      )}
      {document.canArchive && (
        <Button variant="ghost" size={size} onClick={() => onArchive(document)} disabled={saving}>
          <Archive className="size-3.5" />归档
        </Button>
      )}
    </div>
  );
}

export default function DocumentCenterWorkbench({ capabilities }: { capabilities: Capabilities }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [list, setList] = useState<ListResponse>(EMPTY_LIST);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState<DocumentRow | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<DocumentRow | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState("");

  const activeCategories = useMemo(() => categories.filter((item) => item.isActive), [categories]);

  const refreshCategories = useCallback(async () => {
    const response = await fetch("/api/mvp/document-config", { cache: "no-store" });
    const payload = await jsonPayload(response);
    if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) throw new Error(errorMessage(payload, "读取文档分类失败。"));
    setCategories(payload.data as Category[]);
  }, []);

  const refreshList = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (categoryId) params.set("categoryId", categoryId);
    if (mine) params.set("mine", "true");
    const response = await fetch(`/api/mvp/documents?${params.toString()}`, { cache: "no-store" });
    const payload = await jsonPayload(response);
    if (!response.ok || !payload?.ok || !Array.isArray(payload.data) || !payload.meta || !payload.summary) {
      throw new Error(errorMessage(payload, "读取文档列表失败。"));
    }
    setList({ data: payload.data as DocumentRow[], meta: payload.meta, summary: payload.summary });
  }, [categoryId, mine, page, pageSize, q, status]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshCategories(), refreshList()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文档中心暂时不可用。" );
    } finally {
      setLoading(false);
    }
  }, [refreshCategories, refreshList]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAll]);

  useEffect(() => {
    if (!showUpload && !previewing && !reviewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowUpload(false);
      setUploadError(null);
      setPreviewing(null);
      setReviewing(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewing, reviewing, showUpload]);

  function closeUpload() {
    setShowUpload(false);
    setUploadError(null);
    setUploadFile(null);
  }

  function selectUploadFile(file: File | null) {
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);
  }

  function acceptClipboardFile(event: ClipboardEvent<HTMLElement>) {
    const direct = Array.from(event.clipboardData.files)[0];
    const fromItem = Array.from(event.clipboardData.items).find((item) => item.kind === "file")?.getAsFile();
    const file = direct ?? fromItem;
    if (!file) return;
    event.preventDefault();
    selectUploadFile(file);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setUploadError("请先选择、拖入或粘贴一个文件。");
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload = new FormData();
    payload.set("title", String(form.get("title") ?? "").trim());
    payload.set("categoryId", String(form.get("categoryId") ?? ""));
    payload.set("targetType", "GENERAL");
    payload.set("file", uploadFile);
    setSaving(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/mvp/documents", { method: "POST", body: payload });
      const result = await jsonPayload(response);
      if (!response.ok || !result?.ok) throw new Error(errorMessage(result, "文档上传失败。"));
      closeUpload();
      setPage(1);
      await refreshAll();
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "文档上传失败。" );
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mvp/document-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          code: String(form.get("code") ?? ""),
          description: String(form.get("description") ?? ""),
          sortOrder: Number(form.get("sortOrder") ?? 0),
        }),
      });
      const result = await jsonPayload(response);
      if (!response.ok || !result?.ok) throw new Error(errorMessage(result, "保存分类失败。"));
      event.currentTarget.reset();
      await refreshCategories();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存分类失败。" );
    } finally {
      setSaving(false);
    }
  }

  async function setCategoryActive(category: Category) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mvp/document-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: category.id, isActive: !category.isActive }),
      });
      const result = await jsonPayload(response);
      if (!response.ok || !result?.ok) throw new Error(errorMessage(result, "更新分类失败。"));
      await refreshCategories();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新分类失败。" );
    } finally {
      setSaving(false);
    }
  }

  async function openPreview(document: DocumentRow) {
    setPreviewing(document);
    setPreviewText(null);
    setPreviewError(null);
    if (!isDocx(document)) return;
    setPreviewPending(true);
    try {
      const response = await fetch(`/api/mvp/documents/${document.id}/preview`, { cache: "no-store" });
      const payload = await jsonPayload(response);
      if (!response.ok || !payload?.ok || typeof (payload.data as { text?: unknown } | undefined)?.text !== "string") {
        throw new Error(errorMessage(payload, "Word 预览加载失败。"));
      }
      setPreviewText((payload.data as { text: string }).text || "（该 Word 文档没有可提取的文字。）");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "请下载原件查看。";
      setPreviewError(`预览失败：${message}`);
      setPreviewText(`预览失败：${message}`);
    } finally {
      setPreviewPending(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/documents/${reviewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "review", reviewStatus: reviewDecision, reviewNote, version: reviewing.version }),
      });
      const payload = await jsonPayload(response);
      if (!response.ok || !payload?.ok) throw new Error(errorMessage(payload, "审核操作失败。"));
      setReviewing(null);
      setReviewNote("");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审核操作失败。" );
    } finally {
      setSaving(false);
    }
  }

  async function archiveDocument(document: DocumentRow) {
    if (!window.confirm(`确认归档“${document.title}”吗？原件和审计记录会保留，不会物理删除。`)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "archive", version: document.version }),
      });
      const payload = await jsonPayload(response);
      if (!response.ok || !payload?.ok) throw new Error(errorMessage(payload, "归档失败。"));
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "归档失败。" );
    } finally {
      setSaving(false);
    }
  }

  function beginReview(document: DocumentRow) {
    setReviewing(document);
    setReviewDecision("APPROVED");
    setReviewNote("");
  }

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setCategoryId("");
    setMine(false);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-amber-200 bg-gradient-to-r from-white via-amber-50/50 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700"><ShieldCheck className="size-4" />受控资料与协作</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">文档中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">上传后进入审核流；通过后才按权限开放预览。图片、PDF、Word 与视频原件均由系统受控保存，旧资料不会被自动删除。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshAll()} disabled={loading || saving}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>
            {capabilities.canConfigure && <Button variant="outline" onClick={() => setShowCategories((value) => !value)}><FolderCog className="size-4" />分类配置</Button>}
            {capabilities.canCreate && <Button onClick={() => { setUploadError(null); setShowUpload(true); }}><Upload className="size-4" />上传文档</Button>}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="文档统计">
        {[
          ["可见资料", list.summary.total, "border-slate-200 bg-white text-slate-950"],
          ["待审核", list.summary.pending, "border-amber-200 bg-amber-50 text-amber-900"],
          ["已通过", list.summary.approved, "border-emerald-200 bg-emerald-50 text-emerald-900"],
          ["已退回", list.summary.rejected, "border-rose-200 bg-rose-50 text-rose-900"],
        ].map(([label, count, style]) => (
          <article key={String(label)} className={`rounded-2xl border p-4 shadow-sm ${style}`}>
            <p className="text-xs font-semibold">{label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{count}</p>
          </article>
        ))}
      </section>

      {showCategories && capabilities.canConfigure && (
        <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">文档分类配置</h2>
              <p className="mt-1 text-xs text-slate-500">分类是当前业务板块的数据库配置；停用后保留历史归属，不再出现于上传选择中。</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowCategories(false)} aria-label="关闭分类配置"><X className="size-4" /></Button>
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)]">
            <div className="space-y-2">
              {categories.length ? categories.map((category) => (
                <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{category.name} <span className="ml-1 font-mono text-xs text-slate-400">{category.code}</span></p>
                    {category.description && <p className="mt-1 text-xs text-slate-500">{category.description}</p>}
                  </div>
                  <Button variant={category.isActive ? "outline" : "warning"} size="sm" onClick={() => void setCategoryActive(category)} disabled={saving}>{category.isActive ? "停用" : "启用"}</Button>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">还没有分类。请在右侧创建第一项。</div>}
            </div>
            <form onSubmit={addCategory} className="grid content-start gap-3 rounded-2xl bg-amber-50/70 p-4">
              <h3 className="font-bold text-slate-900">新增分类</h3>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">名称 *<input className={inputClassName()} name="name" required maxLength={80} placeholder="例如：制度与流程" /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">编码（可选）<input className={inputClassName()} name="code" maxLength={64} placeholder="留空由系统生成" /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">排序<input className={inputClassName()} name="sortOrder" type="number" defaultValue="0" /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">说明<textarea className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" name="description" maxLength={400} /></label>
              <Button type="submit" disabled={saving}><Plus className="size-4" />保存分类</Button>
            </form>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,.7fr))_auto]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClassName()} pl-9`} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="搜索标题、文件名、上传人" /></label>
          <select className={selectClassName()} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="PENDING_REVIEW">待审核</option><option value="APPROVED">已通过</option><option value="REJECTED">已退回</option></select>
          <select className={selectClassName()} value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">全部分类</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); setPage(1); }} />只看我上传</label>
          <Button variant="outline" onClick={resetFilters}>重置</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 p-3 sm:hidden">
          {loading ? <p className="py-10 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />正在读取受控资料…</p> : list.data.length ? list.data.map((document) => (
            <article key={document.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold text-slate-950">{document.title}</p><p className="mt-1 truncate text-xs text-slate-500">{document.fileName} · {formatBytes(document.fileSizeBytes)}</p></div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta[document.reviewStatus].className}`}>{statusMeta[document.reviewStatus].label}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="text-slate-400">分类</dt><dd className="mt-0.5 text-slate-700">{document.category?.name ?? "未分类"}</dd></div><div><dt className="text-slate-400">上传人</dt><dd className="mt-0.5 text-slate-700">{document.ownerUser.fullName || document.ownerUser.username}</dd></div><div className="col-span-2"><dt className="text-slate-400">审核信息</dt><dd className="mt-0.5 text-slate-700">{document.reviewNote || (document.reviewStatus === "PENDING_REVIEW" ? "等待审核" : "—")}</dd></div></dl>
              <DocumentActions document={document} onPreview={(item) => void openPreview(item)} onReview={beginReview} onArchive={(item) => void archiveDocument(item)} saving={saving} mobile />
            </article>
          )) : <p className="py-12 text-center text-sm text-slate-500"><FileText className="mx-auto mb-3 size-8 text-slate-300" />暂无符合条件的资料。</p>}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-semibold">资料</th><th className="px-4 py-3 font-semibold">分类</th><th className="px-4 py-3 font-semibold">状态</th><th className="px-4 py-3 font-semibold">上传人</th><th className="px-4 py-3 font-semibold">审核信息</th><th className="px-4 py-3 font-semibold">上传时间</th><th className="px-4 py-3 font-semibold text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />正在读取受控资料…</td></tr> : list.data.length ? list.data.map((document) => (
                <tr key={document.id} className="hover:bg-amber-50/40"><td className="px-4 py-3"><div className="flex max-w-[280px] items-center gap-3">{isImage(document) ? <ImageIcon className="size-5 shrink-0 text-sky-600" /> : <FileText className="size-5 shrink-0 text-amber-700" />}<div className="min-w-0"><p className="truncate font-semibold text-slate-950" title={document.title}>{document.title}</p><p className="mt-1 truncate text-xs text-slate-500" title={document.fileName}>{document.fileName} · {formatBytes(document.fileSizeBytes)}</p></div></div></td><td className="px-4 py-3 text-slate-700">{document.category?.name ?? "未分类"}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta[document.reviewStatus].className}`}>{statusMeta[document.reviewStatus].label}</span></td><td className="px-4 py-3 text-slate-700">{document.ownerUser.fullName || document.ownerUser.username}</td><td className="px-4 py-3"><p className="max-w-52 truncate text-xs text-slate-600" title={document.reviewNote ?? ""}>{document.reviewNote || (document.reviewStatus === "PENDING_REVIEW" ? "等待审核" : "—")}</p>{document.reviewedByMembership && <p className="mt-1 text-[11px] text-slate-400">{document.reviewedByMembership.user.fullName || document.reviewedByMembership.user.username}</p>}</td><td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{formatTime(document.createdAt)}</td><td className="px-4 py-3"><DocumentActions document={document} onPreview={(item) => void openPreview(item)} onReview={beginReview} onArchive={(item) => void archiveDocument(item)} saving={saving} /></td></tr>
              )) : <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500"><FileText className="mx-auto mb-3 size-8 text-slate-300" />暂无符合条件的资料{capabilities.canCreate ? "，可点击右上角上传文档。" : "。"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>共 {list.meta.total} 条 · 第 {list.meta.page} / {Math.max(1, list.meta.pageCount)} 页</span><div className="flex flex-wrap items-center gap-2"><select className={selectClassName()} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" />上一页</Button><Button variant="outline" size="sm" disabled={page >= list.meta.pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="size-4" /></Button></div></div>
      </section>

      {showUpload && <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="上传文档"><form onSubmit={uploadDocument} onPaste={acceptClipboardFile} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">上传文档</h2><p className="mt-1 text-sm text-slate-500">支持图片、PDF、Word（.docx）与 MP4。系统会验证真实文件签名，不能手填存储路径。</p></div><Button type="button" variant="ghost" size="icon" onClick={closeUpload} aria-label="关闭上传"><X className="size-4" /></Button></div><div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-semibold text-slate-700">资料标题 *<input className={inputClassName()} name="title" required maxLength={160} placeholder="例如：2026 年员工手册" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">分类<select className={selectClassName()} name="categoryId"><option value="">暂不分类</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{uploadError && <p role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{uploadError}</p>}<div tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectUploadFile(event.dataTransfer.files?.[0] ?? null); }} onPaste={acceptClipboardFile} className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-5 text-center text-sm text-slate-600 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" aria-label="文件上传区，可拖入文件或粘贴截图"><Upload className="mx-auto mb-2 size-6 text-amber-700" /><p className="font-semibold text-slate-800">{uploadFile ? uploadFile.name : "选择文件、直接拖入，或在此粘贴微信截图"}</p><p className="mt-1 text-xs">图片最多 5MB；PDF/Word 最多 10MB；MP4 最多 50MB。</p><label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">选择文件<input className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.mp4,image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/mp4" onChange={(event) => selectUploadFile(event.target.files?.[0] ?? null)} /></label></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeUpload}>取消</Button><Button type="submit" disabled={saving || !uploadFile}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}提交审核</Button></div></div></form></div>}

      {previewing && <div className="fixed inset-0 z-[90] flex bg-slate-950/70 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="文档预览"><section className="flex min-h-0 w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-950">{previewing.title}</h2><p className="truncate text-xs text-slate-500">{previewing.fileName} · {formatBytes(previewing.fileSizeBytes)}</p></div><div className="flex items-center gap-2"><a className="inline-flex h-9 items-center gap-1 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50" href={contentUrl(previewing.id)} target="_blank" rel="noreferrer"><FileDown className="size-3.5" />下载原件</a><Button variant="ghost" size="icon" onClick={() => setPreviewing(null)} aria-label="关闭预览"><X className="size-4" /></Button></div></header><div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">{previewError && <p role="alert" className="mx-auto mb-3 max-w-5xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{previewError}，可下载原件查看。</p>}{isImage(previewing) ? <div className="relative mx-auto h-[65vh] w-full max-w-5xl"><Image unoptimized fill sizes="(max-width: 640px) 95vw, 85vw" onError={() => setPreviewError("图片加载失败")} className="rounded-xl object-contain shadow-sm" src={contentUrl(previewing.id)} alt={previewing.title} /></div> : isPdf(previewing) ? <iframe onError={() => setPreviewError("PDF 预览加载失败")} className="h-full min-h-[65vh] w-full rounded-xl bg-white" src={contentUrl(previewing.id)} title={previewing.title} /> : isDocx(previewing) ? <div className="mx-auto max-w-4xl rounded-2xl bg-white p-5 shadow-sm"><p className="mb-3 text-xs font-semibold text-amber-800">Word 本地纯文本预览（原格式请下载查看）</p>{previewPending ? <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />正在解析…</p> : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-800">{previewText}</pre>}</div> : <div className="grid min-h-[50vh] place-items-center text-center"><FileText className="mx-auto mb-3 size-10 text-slate-400" /><p className="font-semibold text-slate-800">此类型不支持页内预览</p><a className="mt-3 text-sm font-semibold text-amber-800 underline" href={contentUrl(previewing.id)} target="_blank" rel="noreferrer">下载原件</a></div>}</div></section></div>}

      {reviewing && <div className="fixed inset-0 z-[95] flex items-end bg-slate-950/35 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="审核文档"><form onSubmit={submitReview} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">审核文档</h2><p className="mt-1 text-sm text-slate-500">{reviewing.title}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setReviewing(null)} aria-label="关闭审核"><X className="size-4" /></Button></div><div className="mt-5 grid gap-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setReviewDecision("APPROVED")} className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${reviewDecision === "APPROVED" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600"}`}><CheckCircle2 className="mx-auto mb-1 size-5" />通过</button><button type="button" onClick={() => setReviewDecision("REJECTED")} className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${reviewDecision === "REJECTED" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600"}`}><X className="mx-auto mb-1 size-5" />退回</button></div><label className="grid gap-1.5 text-sm font-semibold text-slate-700">审核备注{reviewDecision === "REJECTED" ? " *" : "（可选）"}<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} required={reviewDecision === "REJECTED"} maxLength={800} className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder={reviewDecision === "REJECTED" ? "请说明需要修改的内容" : "可补充审核说明"} /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setReviewing(null)}>取消</Button><Button type="submit" variant={reviewDecision === "APPROVED" ? "success" : "destructive"} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{reviewDecision === "APPROVED" ? "确认通过" : "确认退回"}</Button></div></div></form></div>}
    </div>
  );
}
