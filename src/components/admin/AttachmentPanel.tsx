"use client";

import Image from "next/image";
import type { AttachmentTargetType } from "@/lib/attachments";
import { ChevronLeft, ChevronRight, FileText, ImageOff, LoaderCircle, Paperclip, RefreshCw, Trash2, Upload, X } from "lucide-react";
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
}: {
  targetType: AttachmentTargetType;
  targetId: string;
  canUpload: boolean;
  canDelete: boolean;
  title?: string;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Record<string, number>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const imageItems = items.filter((item) => item.mimeType.startsWith("image/"));

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
            const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/") || item.type === "application/pdf");
            if (file) {
              event.preventDefault();
              void upload(file);
            }
          }}
          tabIndex={0}
          className={`mt-4 rounded-xl border-2 border-dashed p-4 text-center text-sm transition ${dragging ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}
          aria-label="拖拽或粘贴凭证"
        >
          {dragging ? "松开鼠标即可上传" : "可从微信直接拖入截图，或复制截图后在此处按 Ctrl+V 粘贴上传"}
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
                    <button type="button" className="absolute inset-0" onClick={() => setPreviewIndex(imageItems.findIndex((image) => image.id === item.id))} aria-label={`预览 ${item.originalName}`}>
                      <Image unoptimized fill sizes="(max-width: 640px) 100vw, 320px" src={contentUrl} alt={item.originalName} className="object-contain" onError={() => setFailed((current) => ({ ...current, [item.id]: 1 }))} />
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
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="图片预览">
          <button type="button" onClick={() => setPreviewIndex(null)} className="absolute right-5 top-5 rounded-full bg-white/90 p-2 text-slate-800" aria-label="关闭预览"><X size={20} /></button>
          <button type="button" disabled={previewIndex <= 0} onClick={() => setPreviewIndex((value) => value === null ? null : Math.max(0, value - 1))} className="absolute left-4 rounded-full bg-white/90 p-3 text-slate-800 disabled:opacity-30" aria-label="上一张"><ChevronLeft size={24} /></button>
          <div className="relative h-[80vh] w-[80vw] max-w-5xl">
            <Image unoptimized fill sizes="80vw" src={`/api/mvp/attachments/${imageItems[previewIndex].id}/content?v=${versions[imageItems[previewIndex].id] ?? 0}`} alt={imageItems[previewIndex].originalName} className="object-contain" />
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{imageItems[previewIndex].originalName} · {previewIndex + 1}/{imageItems.length}</p>
          </div>
          <button type="button" disabled={previewIndex >= imageItems.length - 1} onClick={() => setPreviewIndex((value) => value === null ? null : Math.min(imageItems.length - 1, value + 1))} className="absolute right-4 rounded-full bg-white/90 p-3 text-slate-800 disabled:opacity-30" aria-label="下一张"><ChevronRight size={24} /></button>
        </div>
      )}
    </section>
  );
}
