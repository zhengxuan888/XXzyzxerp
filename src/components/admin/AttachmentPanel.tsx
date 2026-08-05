"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AttachmentTargetType } from "@/lib/attachments";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImageOff, LoaderCircle, Minus, Paperclip, Plus, RefreshCw, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  uploadedByUser: { fullName: string };
};

export default function AttachmentPanel({
  targetType,
  targetId,
  canUpload,
  canDelete,
  title = "附件",
  refreshAfterUpload = false,
}: {
  targetType: AttachmentTargetType;
  targetId: string;
  canUpload: boolean;
  canDelete: boolean;
  title?: string;
  refreshAfterUpload?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Record<string, number>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const imageItems = items.filter((item) => item.mimeType.startsWith("image/"));

  function imageUrl(item: Attachment) {
    return `/api/mvp/attachments/${item.id}/content?v=${versions[item.id] ?? 0}`;
  }

  function openPreview(index: number) {
    setPreviewScale(1);
    setPreviewLoading(true);
    setPreviewIndex(index);
    [index - 1, index + 1].forEach((nearbyIndex) => {
      const nearby = imageItems[nearbyIndex];
      if (nearby) {
        const preload = new window.Image();
        preload.src = imageUrl(nearby);
      }
    });
  }

  function showPrevious() {
    if (previewIndex === null || imageItems.length < 2) return;
    setPreviewScale(1);
    setPreviewLoading(true);
    setPreviewIndex((previewIndex - 1 + imageItems.length) % imageItems.length);
  }

  function showNext() {
    if (previewIndex === null || imageItems.length < 2) return;
    setPreviewScale(1);
    setPreviewLoading(true);
    setPreviewIndex((previewIndex + 1) % imageItems.length);
  }

  useEffect(() => {
    if (previewIndex === null) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewIndex(null);
      if (event.key === "ArrowLeft" && imageItems.length > 1) {
        setPreviewScale(1);
        setPreviewLoading(true);
        setPreviewIndex((value) => value === null ? null : (value - 1 + imageItems.length) % imageItems.length);
      }
      if (event.key === "ArrowRight" && imageItems.length > 1) {
        setPreviewScale(1);
        setPreviewLoading(true);
        setPreviewIndex((value) => value === null ? null : (value + 1) % imageItems.length);
      }
      if (event.key === "+" || event.key === "=") setPreviewScale((value) => Math.min(4, value + 0.25));
      if (event.key === "-") setPreviewScale((value) => Math.max(0.5, value - 0.25));
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [previewIndex, imageItems.length]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/mvp/attachments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "获取附件失败");
      setItems(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取附件失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/mvp/attachments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "获取附件失败");
        if (active) setItems(payload.data);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "获取附件失败");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [targetId, targetType]);

  async function upload(file: File | null) {
    if (!file || !canUpload) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("targetType", targetType);
      form.set("targetId", targetId);
      form.set("file", file);
      const response = await fetch("/api/mvp/attachments", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "上传失败");
      await load();
      if (refreshAfterUpload) router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: Attachment) {
    if (!canDelete || !window.confirm(`确认删除附件 ${item.originalName} ?`)) return;
    const response = await fetch(`/api/mvp/attachments/${item.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "删除失败");
      return;
    }
    await load();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-950">
            <Paperclip size={17} className="text-violet-600" />
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">支持图片（5MB）、PDF（10MB）、MP4（50MB）</p>
        </div>
        {canUpload && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "上传中..." : "上传文件"}
            <input
              aria-label="上传附件"
              type="file"
              className="sr-only"
              disabled={uploading}
              accept=".png,.jpg,.jpeg,.webp,.pdf,.mp4,image/png,image/jpeg,image/webp,application/pdf,video/mp4"
              onChange={(event) => {
                void upload(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </div>

      {canUpload && (
        <div
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files?.[0] ?? null);
          }}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.items)
              .find((item) => item.kind === "file")
              ?.getAsFile() ?? Array.from(event.clipboardData.files)[0] ?? null;
            if (file) {
              event.preventDefault();
              void upload(file);
            }
          }}
          tabIndex={0}
          className={`mt-4 rounded-xl border-2 border-dashed p-4 text-center text-sm transition ${dragging ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}
          aria-label="拖拽或粘贴凭证"
        >
          {dragging ? "松开鼠标即可上传" : "拖入图片或文件 · Ctrl+V 粘贴截图 · 也可点击上方选择文件"}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" /> 加载中...</div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">暂无文件</div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const contentUrl = `/api/mvp/attachments/${item.id}/content?v=${versions[item.id] ?? 0}`;
            const isImage = item.mimeType.startsWith("image/");
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-slate-100">
                  {isImage && !failed[item.id] ? (
                    <button type="button" className="absolute inset-0" onClick={() => openPreview(imageItems.findIndex((image) => image.id === item.id))} aria-label={`预览 ${item.originalName}`}>
                      <Image unoptimized fill loading="lazy" sizes="(max-width: 640px) 100vw, 320px" src={contentUrl} alt={item.originalName} className="object-contain" onError={() => setFailed((current) => ({ ...current, [item.id]: 1 }))} />
                    </button>
                  ) : isImage ? (
                    <div className="p-4 text-center text-slate-500">
                      <ImageOff className="mx-auto mb-2" />
                      <p className="text-xs">图片加载失败</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFailed((current) => ({ ...current, [item.id]: 0 }));
                          setVersions((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700"
                      >
                        <RefreshCw size={13} /> 重试
                      </button>
                    </div>
                  ) : (
                    <a href={contentUrl} target="_blank" rel="noreferrer" className="text-center text-slate-600 hover:text-violet-700">
                      <FileText className="mx-auto mb-2" size={34} />
                      <span className="text-xs font-semibold">预览/下载</span>
                    </a>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-slate-800" title={item.originalName}>
                    {item.originalName}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {(item.sizeBytes / 1024).toFixed(1)} KB / {item.uploadedByUser.fullName}
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {previewIndex !== null && imageItems[previewIndex] && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewIndex(null); }}>
          <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-slate-900/80 p-1.5 text-white shadow-xl backdrop-blur">
            <button type="button" onClick={() => setPreviewScale((value) => Math.max(0.5, value - 0.25))} className="rounded-lg p-2 hover:bg-white/15" aria-label="缩小"><Minus size={18} /></button>
            <span className="min-w-14 text-center text-xs tabular-nums">{Math.round(previewScale * 100)}%</span>
            <button type="button" onClick={() => setPreviewScale((value) => Math.min(4, value + 0.25))} className="rounded-lg p-2 hover:bg-white/15" aria-label="放大"><Plus size={18} /></button>
            <button type="button" onClick={() => setPreviewScale(1)} className="rounded-lg p-2 hover:bg-white/15" aria-label="恢复原始大小"><RotateCcw size={18} /></button>
            <a href={imageUrl(imageItems[previewIndex])} target="_blank" rel="noreferrer" className="rounded-lg p-2 hover:bg-white/15" aria-label="在新窗口打开原图"><ExternalLink size={18} /></a>
          </div>
          <button type="button" onClick={() => setPreviewIndex(null)} className="absolute right-5 top-5 z-20 rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white" aria-label="关闭预览"><X size={20} /></button>
          {imageItems.length > 1 && <button type="button" onClick={showPrevious} className="absolute left-4 z-20 rounded-full bg-white/90 p-3 text-slate-800 hover:bg-white" aria-label="上一张"><ChevronLeft size={24} /></button>}
          <div className="relative h-[82vh] w-[86vw] max-w-6xl overflow-auto rounded-lg overscroll-contain" onWheel={(event) => { if (event.ctrlKey) { event.preventDefault(); setPreviewScale((value) => Math.min(4, Math.max(0.5, value + (event.deltaY < 0 ? 0.25 : -0.25)))); } }}>
            {previewLoading && <div className="absolute inset-0 z-10 grid place-items-center"><span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white"><LoaderCircle className="animate-spin" size={18} />正在加载原图</span></div>}
            <div
              className="grid place-items-center transition-[width,height] duration-150"
              style={{
                width: `${Math.max(1, previewScale) * 100}%`,
                height: `${Math.max(1, previewScale) * 100}%`,
                minWidth: "100%",
                minHeight: "100%",
              }}
            >
              {/* Native img reuses the authenticated full-image response and avoids a second optimizer request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(imageItems[previewIndex])}
                alt={imageItems[previewIndex].originalName}
                draggable={false}
                onLoad={() => setPreviewLoading(false)}
                onError={() => setPreviewLoading(false)}
                className="block h-full w-full object-contain"
                style={{ transform: previewScale < 1 ? `scale(${previewScale})` : undefined }}
              />
            </div>
            <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">{imageItems[previewIndex].originalName} · {previewIndex + 1}/{imageItems.length}</p>
          </div>
          {imageItems.length > 1 && <button type="button" onClick={showNext} className="absolute right-4 z-20 rounded-full bg-white/90 p-3 text-slate-800 hover:bg-white" aria-label="下一张"><ChevronRight size={24} /></button>}
        </div>
      )}
    </section>
  );
}
