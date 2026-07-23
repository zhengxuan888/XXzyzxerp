"use client";

import Image from "next/image";
import { FileText, ImageOff, LoaderCircle, Paperclip, RefreshCw, Trash2, Upload } from "lucide-react";
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
  title = "图片与附件",
}: {
  targetType: "PRODUCT" | "CONVERSATION";
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/mvp/attachments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "附件加载失败");
      setItems(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "附件加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/mvp/attachments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "附件加载失败");
        if (active) setItems(payload.data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "附件加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
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
    if (!canDelete || !window.confirm(`确认删除附件“${item.originalName}”？`)) return;
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
          <h2 className="flex items-center gap-2 font-bold text-slate-950"><Paperclip size={17} className="text-violet-600" />{title}</h2>
          <p className="mt-1 text-xs text-slate-500">支持 PNG、JPEG、WebP（≤5MB）和 PDF（≤10MB），服务端验证真实文件签名。</p>
        </div>
        {canUpload && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "安全校验中…" : "上传附件"}
            <input
              aria-label="选择附件"
              type="file"
              className="sr-only"
              disabled={uploading}
              accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => {
                void upload(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" />正在加载附件…</div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">暂无附件。</div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const contentUrl = `/api/mvp/attachments/${item.id}/content?v=${versions[item.id] ?? 0}`;
            const image = item.mimeType.startsWith("image/");
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-slate-100">
                  {image && !failed[item.id] ? (
                    <Image
                      unoptimized
                      fill
                      sizes="(max-width: 640px) 100vw, 320px"
                      src={contentUrl}
                      alt={item.originalName}
                      className="object-contain"
                      onError={() => setFailed((current) => ({ ...current, [item.id]: 1 }))}
                    />
                  ) : image ? (
                    <div className="p-4 text-center text-slate-500">
                      <ImageOff className="mx-auto mb-2" />
                      <p className="text-xs">图片加载失败</p>
                      <button type="button" onClick={() => {
                        setFailed((current) => ({ ...current, [item.id]: 0 }));
                        setVersions((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
                      }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                        <RefreshCw size={13} /> 重试
                      </button>
                    </div>
                  ) : (
                    <a href={contentUrl} target="_blank" rel="noreferrer" className="text-center text-slate-600 hover:text-violet-700">
                      <FileText className="mx-auto mb-2" size={34} /><span className="text-xs font-semibold">打开 PDF</span>
                    </a>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-slate-800" title={item.originalName}>{item.originalName}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{(item.sizeBytes / 1024).toFixed(1)} KB · {item.uploadedByUser.fullName}</p>
                  {canDelete && <button type="button" onClick={() => void remove(item)} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={14} />删除</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
