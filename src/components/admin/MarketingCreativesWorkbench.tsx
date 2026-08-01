"use client";

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import AttachmentPanel from "@/components/admin/AttachmentPanel";

type SelectOption = {
  id: string;
  name: string;
  code?: string;
  color?: string | null;
  isActive?: boolean;
};

type Asset = {
  id: string;
  purpose: string;
  sortOrder: number;
  attachment: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  };
};

type Creative = {
  id: string;
  code: string;
  name: string;
  marketCode: string | null;
  languageCode: string | null;
  description: string | null;
  isArchived: boolean;
  retiredReason: string | null;
  createdAt: string;
  updatedAt: string;
  status: SelectOption;
  source: SelectOption | null;
  product: SelectOption | null;
  owner: { membershipId: string; name: string | null; username: string };
  tags: SelectOption[];
  assets: Asset[];
  canUpdate: boolean;
  canArchive: boolean;
};

type Meta = { page: number; pageSize: number; total: number; pageCount: number };

type Editor = {
  id?: string;
  code: string;
  name: string;
  statusId: string;
  sourceId: string;
  marketCode: string;
  languageCode: string;
  description: string;
  tagIds: string[];
};

const emptyMeta: Meta = { page: 1, pageSize: 20, total: 0, pageCount: 1 };
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
const buttonBase = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function readableDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function safeColor(color: string | null | undefined) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#a16207";
}

function createEmptyEditor(defaultStatusId: string): Editor {
  return {
    code: `CR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-`,
    name: "",
    statusId: defaultStatusId,
    sourceId: "",
    marketCode: "",
    languageCode: "",
    description: "",
    tagIds: [],
  };
}

function editorFromCreative(creative: Creative): Editor {
  return {
    id: creative.id,
    code: creative.code,
    name: creative.name,
    statusId: creative.status.id,
    sourceId: creative.source?.id ?? "",
    marketCode: creative.marketCode ?? "",
    languageCode: creative.languageCode ?? "",
    description: creative.description ?? "",
    tagIds: creative.tags.map((tag) => tag.id),
  };
}

function AttachmentPreview({ asset }: { asset: Asset }) {
  const contentUrl = `/api/mvp/attachments/${asset.attachment.id}/content`;
  const mimeType = asset.attachment.mimeType;
  const image = mimeType.startsWith("image/");
  const video = mimeType.startsWith("video/");
  return (
    <a
      href={contentUrl}
      target="_blank"
      rel="noreferrer"
      className="group relative grid aspect-[4/3] min-w-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-amber-400 hover:bg-amber-50"
      title={`打开 ${asset.attachment.originalName}`}
    >
      {image ? (
        // The server still authorizes the binary request. The error fallback avoids a broken thumbnail from dominating the page.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={contentUrl} alt={asset.attachment.originalName} className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      ) : video ? (
        <span className="grid place-items-center text-center"><Video size={25} className="mb-2 text-amber-700" /><span className="text-xs font-semibold">视频预览</span></span>
      ) : (
        <span className="grid place-items-center text-center"><FileText size={25} className="mb-2 text-amber-700" /><span className="text-xs font-semibold">PDF / 文件</span></span>
      )}
      <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-slate-950/70 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">{asset.attachment.originalName}</span>
    </a>
  );
}

export default function MarketingCreativesWorkbench({
  canCreate,
  canUpdate,
  canArchive,
  canUpload,
  canDeleteAttachment,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canUpload: boolean;
  canDeleteAttachment: boolean;
}) {
  const [items, setItems] = useState<Creative[]>([]);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [statuses, setStatuses] = useState<SelectOption[]>([]);
  const [tags, setTags] = useState<SelectOption[]>([]);
  const [sources, setSources] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusId, setStatusId] = useState("");
  const [tagId, setTagId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const response = await fetch("/api/mvp/marketing/config", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { data?: { sources?: SelectOption[]; statuses?: SelectOption[]; tags?: SelectOption[] }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "无法加载素材配置");
      setSources((payload?.data?.sources ?? []).filter((row) => row.isActive !== false));
      setStatuses((payload?.data?.statuses ?? []).filter((row) => row.isActive !== false));
      setTags((payload?.data?.tags ?? []).filter((row) => row.isActive !== false));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载素材配置");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadList = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    if (statusId) params.set("statusId", statusId);
    if (tagId) params.set("tagId", tagId);
    if (sourceId) params.set("sourceId", sourceId);
    if (archiveFilter !== "all") params.set("archived", archiveFilter === "archived" ? "true" : "false");
    try {
      const response = await fetch(`/api/mvp/marketing/creatives?${params.toString()}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as { data?: Creative[]; meta?: Meta; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "无法加载素材列表");
      setItems(payload?.data ?? []);
      setMeta(payload?.meta ?? emptyMeta);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "无法加载素材列表");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [archiveFilter, page, pageSize, search, sourceId, statusId, tagId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadConfig(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConfig]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadList(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadList]);

  function resetFilters() {
    setSearch("");
    setSearchInput("");
    setStatusId("");
    setTagId("");
    setSourceId("");
    setArchiveFilter("active");
    setPage(1);
  }

  function openCreate() {
    const firstStatus = statuses[0]?.id ?? "";
    setEditor(createEmptyEditor(firstStatus));
    setNotice("");
  }

  function toggleEditorTag(id: string) {
    setEditor((current) => current ? { ...current, tagIds: current.tagIds.includes(id) ? current.tagIds.filter((value) => value !== id) : [...current.tagIds, id] } : current);
  }

  async function saveEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    if (!editor.statusId) {
      setError("请先选择素材状态。");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const body = {
      ...(editor.id ? {} : { code: editor.code.trim() }),
      name: editor.name.trim(),
      statusId: editor.statusId,
      sourceId: editor.sourceId || null,
      marketCode: editor.marketCode.trim() || null,
      languageCode: editor.languageCode.trim() || null,
      description: editor.description.trim() || null,
      tagIds: editor.tagIds,
    };
    try {
      const response = await fetch(editor.id ? `/api/mvp/marketing/creatives/${editor.id}` : "/api/mvp/marketing/creatives", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "保存素材失败");
      setEditor(null);
      setSelectedId(payload?.data?.id ?? editor.id ?? null);
      setNotice(editor.id ? "素材资料已更新，并已写入操作审计。" : "素材已创建。现在可在详情中上传图片、视频或 PDF。");
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存素材失败");
    } finally {
      setSaving(false);
    }
  }

  async function changeArchive(creative: Creative, archive: boolean) {
    if (!canArchive) return;
    const retiredReason = archive ? window.prompt("请填写归档原因（必填）：")?.trim() ?? "" : null;
    if (archive && !retiredReason) return;
    if (!window.confirm(archive ? `确认归档素材「${creative.name}」？` : `确认恢复素材「${creative.name}」？`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/mvp/marketing/creatives/${creative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive, retiredReason }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "更新归档状态失败");
      setNotice(archive ? "素材已归档。归档原因和操作人已写入审计记录。" : "素材已恢复到可用列表。");
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新归档状态失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><ImageIcon size={18} /> 投放运营</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">素材中心</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">按素材状态、数据源和标签管理投放内容；文件始终按素材归属范围在服务端校验，不会因为看到素材而自动获得附件权限。</p>
          </div>
          {canCreate && <button type="button" onClick={openCreate} disabled={configLoading} className={`${buttonBase} bg-amber-600 text-white hover:bg-amber-700`}><Plus size={17} /> 新建素材</button>}
        </div>
      </header>

      {notice && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check size={18} className="mt-0.5 shrink-0" />{notice}</div>}
      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="flex gap-2"><CircleAlert size={18} className="mt-0.5 shrink-0" />{error}</span><button type="button" onClick={() => { setError(""); void loadConfig(); void loadList(); }} className="shrink-0 font-semibold underline">重试</button></div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="grid gap-3 xl:grid-cols-[minmax(240px,1.7fr)_repeat(4,minmax(130px,.62fr))_auto]">
          <label className="relative block"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${inputClass} pl-10`} placeholder="搜索素材编号、名称或说明…" /></label>
          <select value={statusId} onChange={(event) => { setStatusId(event.target.value); setPage(1); }} className={inputClass}><option value="">全部状态</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select>
          <select value={tagId} onChange={(event) => { setTagId(event.target.value); setPage(1); }} className={inputClass}><option value="">全部标签</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
          <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }} className={inputClass}><option value="">全部数据源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          <select value={archiveFilter} onChange={(event) => { setArchiveFilter(event.target.value as "active" | "archived" | "all"); setPage(1); }} className={inputClass}><option value="active">未归档</option><option value="archived">已归档</option><option value="all">全部记录</option></select>
          <div className="flex gap-2"><button type="submit" className={`${buttonBase} bg-slate-900 text-white hover:bg-slate-800`}><Search size={16} />筛选</button><button type="button" onClick={resetFilters} className={`${buttonBase} border border-slate-200 text-slate-700 hover:bg-slate-50`}>重置</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">可用素材</h2><p className="mt-1 text-xs text-slate-500">搜索、筛选和翻页均由服务器完成；排序固定为未归档优先、最近更新优先。</p></div><button type="button" disabled={loading} onClick={() => void loadList()} className={`${buttonBase} min-h-9 border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50`}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />刷新</button></div>
        {loading ? <div className="grid min-h-72 place-items-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" />正在加载素材…</span></div> : items.length === 0 ? <div className="grid min-h-72 place-items-center px-5 text-center"><div><ImageIcon className="mx-auto text-slate-300" size={38} /><p className="mt-3 font-semibold text-slate-700">暂无匹配素材</p><p className="mt-1 text-sm text-slate-500">调整筛选条件，或由有权限的员工新建第一条素材。</p></div></div> : <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((creative) => <article key={creative.id} className={`overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-md ${selectedId === creative.id ? "border-amber-400 ring-2 ring-amber-100" : "border-slate-200"}`}>
            <button type="button" onClick={() => { setSelectedId(creative.id); setEditor(null); }} className="block w-full text-left">
              <div className="grid min-h-44 grid-cols-2 gap-2 bg-slate-50 p-3">
                {creative.assets.slice(0, 2).map((asset) => <AttachmentPreview key={asset.id} asset={asset} />)}
                {!creative.assets.length && <div className="col-span-2 grid place-items-center rounded-xl border border-dashed border-slate-200 bg-white text-center text-xs text-slate-400"><ImageIcon size={24} className="mb-2" />尚未上传附件</div>}
                {creative.assets.length === 1 && <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400">可继续添加素材附件</div>}
              </div>
              <div className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-mono text-xs font-semibold text-amber-700">{creative.code}</p><h3 className="mt-1 truncate font-bold text-slate-950">{creative.name}</h3></div><span style={{ backgroundColor: `${safeColor(creative.status.color)}18`, color: safeColor(creative.status.color) }} className="rounded-full px-2.5 py-1 text-xs font-semibold">{creative.status.name}</span></div>
              <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{creative.description || "未填写素材说明"}</p><div className="mt-3 flex flex-wrap gap-1.5">{creative.tags.map((tag) => <span key={tag.id} style={{ borderColor: `${safeColor(tag.color)}55`, color: safeColor(tag.color) }} className="rounded-full border px-2 py-0.5 text-[11px] font-medium">{tag.name}</span>)}{creative.isArchived && <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">已归档</span>}</div><div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{creative.source?.name || "未归属数据源"}</span><span>{readableDate(creative.updatedAt)}</span></div></div>
            </button>
          </article>)}
        </div>}
        <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>共 {meta.total} 条 · 第 {meta.page} / {Math.max(1, meta.pageCount)} 页</span><div className="flex flex-wrap items-center gap-2"><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`${buttonBase} min-h-9 border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50`}><ArrowLeft size={14} />上一页</button><button type="button" disabled={page >= meta.pageCount || loading} onClick={() => setPage((value) => value + 1)} className={`${buttonBase} min-h-9 border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50`}>下一页<ArrowRight size={14} /></button></div></footer>
      </section>

      {selected && <section className="rounded-3xl border border-amber-300 bg-white p-5 shadow-lg"><div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">素材详情</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{selected.name}</h2><p className="mt-1 font-mono text-xs text-slate-500">{selected.code} · 创建人：{selected.owner.name || selected.owner.username}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setSelectedId(null); setEditor(null); }} className={`${buttonBase} min-h-9 border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50`}><X size={14} />关闭</button>{canUpdate && selected.canUpdate && <button type="button" onClick={() => setEditor(editorFromCreative(selected))} className={`${buttonBase} min-h-9 border border-amber-300 bg-amber-50 px-3 text-xs text-amber-900 hover:bg-amber-100`}><Pencil size={14} />编辑资料</button>}{canArchive && selected.canArchive && <button type="button" disabled={saving} onClick={() => void changeArchive(selected, !selected.isArchived)} className={`${buttonBase} min-h-9 ${selected.isArchived ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"} px-3 text-xs`}><Archive size={14} />{selected.isArchived ? "恢复素材" : "归档素材"}</button>}</div></div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">素材状态</p><p className="mt-1 font-semibold text-slate-900">{selected.status.name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">投放数据源</p><p className="mt-1 font-semibold text-slate-900">{selected.source?.name || "未填写"}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">市场 / 语言</p><p className="mt-1 font-semibold text-slate-900">{[selected.marketCode, selected.languageCode].filter(Boolean).join(" / ") || "未填写"}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">归档状态</p><p className="mt-1 font-semibold text-slate-900">{selected.isArchived ? `已归档${selected.retiredReason ? `：${selected.retiredReason}` : ""}` : "可用"}</p></div></div>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><Tag size={16} className="text-amber-700" /><h3 className="font-bold text-slate-900">标签与说明</h3></div><div className="mt-3 flex flex-wrap gap-2">{selected.tags.length ? selected.tags.map((tag) => <span key={tag.id} style={{ borderColor: `${safeColor(tag.color)}55`, color: safeColor(tag.color) }} className="rounded-full border px-2.5 py-1 text-xs font-semibold">{tag.name}</span>) : <span className="text-sm text-slate-500">暂无标签</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selected.description || "暂无素材说明"}</p></div>
        <div className="mt-4"><AttachmentPanel targetType="MARKETING_CREATIVE" targetId={selected.id} title="素材附件" canUpload={canUpload && !selected.isArchived} canDelete={canDeleteAttachment && !selected.isArchived} /><p className="mt-2 text-xs text-slate-500">可直接拖入微信截图或在上传区域粘贴截图；图片支持左右切换预览，PDF 和视频可新窗口预览。若当前岗位没有附件读取权限，系统会在附件区提示拒绝访问而不会暴露文件信息。</p></div>
      </section>}

      {editor && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={editor.id ? "编辑素材" : "新建素材"}><div className="mx-auto my-4 max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">投放素材</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{editor.id ? "编辑素材资料" : "新建素材"}</h2><p className="mt-1 text-sm text-slate-500">创建后即可在素材详情中上传图片、视频或 PDF；附件不会影响素材编号。</p></div><button type="button" onClick={() => setEditor(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="关闭"><X size={20} /></button></div>
        <form onSubmit={saveEditor} className="mt-5 grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold text-slate-700">素材编号 *<input value={editor.code} onChange={(event) => setEditor((current) => current ? { ...current, code: event.target.value } : current)} disabled={Boolean(editor.id)} required className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`} placeholder="例如 CR-20260801-001" />{editor.id && <span className="text-xs font-normal text-slate-500">素材编号创建后固定，确保素材历史可追溯。</span>}</label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">素材名称 *<input value={editor.name} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} required className={inputClass} placeholder="例如：波兰手表主图 A" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">素材状态 *<select value={editor.statusId} onChange={(event) => setEditor((current) => current ? { ...current, statusId: event.target.value } : current)} required className={inputClass}><option value="">请选择状态</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">投放数据源<select value={editor.sourceId} onChange={(event) => setEditor((current) => current ? { ...current, sourceId: event.target.value } : current)} className={inputClass}><option value="">未归属数据源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">市场代码<input value={editor.marketCode} onChange={(event) => setEditor((current) => current ? { ...current, marketCode: event.target.value } : current)} className={inputClass} placeholder="例如 PL、ES" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">语言代码<input value={editor.languageCode} onChange={(event) => setEditor((current) => current ? { ...current, languageCode: event.target.value } : current)} className={inputClass} placeholder="例如 pl、es" /></label>
          <fieldset className="md:col-span-2"><legend className="text-sm font-semibold text-slate-700">素材标签</legend><div className="mt-2 flex flex-wrap gap-2">{tags.length ? tags.map((tag) => { const active = editor.tagIds.includes(tag.id); return <button key={tag.id} type="button" onClick={() => toggleEditorTag(tag.id)} style={active ? { backgroundColor: `${safeColor(tag.color)}18`, borderColor: safeColor(tag.color), color: safeColor(tag.color) } : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "" : "border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50"}`}>{active && <Check size={13} className="mr-1 inline" />}{tag.name}</button>; }) : <p className="text-sm text-slate-500">暂无可选标签，可由有配置权限的同事在投放设置中增加。</p>}</div></fieldset>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 md:col-span-2">素材说明<textarea value={editor.description} onChange={(event) => setEditor((current) => current ? { ...current, description: event.target.value } : current)} maxLength={4000} className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="说明素材用途、测试假设、落地页或适用产品…" /></label>
          <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setEditor(null)} className={`${buttonBase} border border-slate-200 text-slate-700 hover:bg-slate-50`}>取消</button><button type="submit" disabled={saving} className={`${buttonBase} bg-amber-600 text-white hover:bg-amber-700`}>{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{saving ? "保存中…" : "保存素材"}</button></div>
        </form>
      </div></div>}
    </div>
  );
}
