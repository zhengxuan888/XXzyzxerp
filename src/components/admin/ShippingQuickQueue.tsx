"use client";

import { ArrowRightLeft, CheckCircle2, ClipboardPaste, ExternalLink, ImagePlus, LoaderCircle, PackageCheck, Truck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ClipboardEvent, useState } from "react";

type QueueRow = {
  orderId: string;
  orderNo: string;
  employee: string;
  recipient: string;
  country: string;
  productSummary: string;
  shopId: string;
  shopWindowTransferredAt: string | null;
  shopWindowTransferredBy: string | null;
  shipmentId: string | null;
  carrier: string | null;
  trackingNo: string | null;
  proofCount: number;
  canOperate: boolean;
};

export default function ShippingQuickQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function saveTracking(row: QueueRow, form: HTMLFormElement) {
    const data = new FormData(form);
    const carrier = String(data.get("carrier") || "").trim();
    const trackingNo = String(data.get("trackingNo") || "").trim();
    if (!carrier || !trackingNo) {
      setMessage("请填写物流商和物流单号。");
      return;
    }
    setBusyId(row.orderId);
    setMessage("");
    const response = await fetch("/api/mvp/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: row.orderId, carrier, trackingNo }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "物流单号保存失败。");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    setEditingTrackingId(null);
    router.refresh();
  }

  async function uploadProof(row: QueueRow, file: File | null) {
    if (!file || !row.shipmentId) return;
    setBusyId(row.orderId);
    setMessage("");
    const form = new FormData();
    form.set("targetType", "SHIPMENT");
    form.set("targetId", row.shipmentId);
    form.set("file", file);
    const response = await fetch("/api/mvp/attachments", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "发货凭证上传失败。");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    router.refresh();
  }

  function pastedImage(event: ClipboardEvent<HTMLDivElement>) {
    return Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile() ?? null;
  }

  async function confirmShipment(row: QueueRow) {
    if (!window.confirm(`确认订单 ${row.orderNo} 已真实发货？确认后将进入物流追踪。`)) return;
    setBusyId(row.orderId);
    setMessage("");
    const response = await fetch(`/api/mvp/orders/${row.orderId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ship" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "确认发货失败。");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    router.refresh();
  }

  async function toggleShopWindowTransfer(row: QueueRow) {
    const transferred = !row.shopWindowTransferredAt;
    setBusyId(row.orderId);
    setMessage("");
    const response = await fetch(`/api/mvp/orders/${row.orderId}/shop-window-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferred }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "窗口转移状态保存失败。");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    router.refresh();
  }

  return (
    <section id="shipping-confirmation" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><Truck size={19} className="text-amber-700" />待发货处理</h2>
          <p className="mt-1 text-xs text-slate-500">每个订单只显示当前需要完成的操作。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{rows.length} 单</span>
      </div>

      {message && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{message}</p>}

      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const busy = busyId === row.orderId;
          const step = !row.trackingNo ? "TRACKING" : row.proofCount < 1 ? "PROOF" : !row.shopWindowTransferredAt ? "TRANSFER" : "CONFIRM";
          return (
            <article key={row.orderId} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(280px,1.2fr)_minmax(260px,1fr)_minmax(420px,1.5fr)] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/orders/${row.orderId}`} className="font-bold text-slate-950 hover:text-amber-700">{row.orderNo}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${step === "TRACKING" ? "bg-amber-50 text-amber-700" : step === "PROOF" ? "bg-blue-50 text-blue-700" : step === "TRANSFER" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {step === "TRACKING" ? "待物流单号" : step === "PROOF" ? "待发货凭证" : step === "TRANSFER" ? "待窗口转移" : "可确认发货"}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{row.productSummary || "-"}</p>
                <p className="mt-1 text-xs text-slate-400">{row.employee} · {row.recipient} · {row.country}</p>
              </div>

              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">窗口 ID</span>
                  <strong className={row.shopId ? "font-mono text-slate-900" : "text-rose-600"}>{row.shopId || "未填写"}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.shopWindowTransferredAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {row.shopWindowTransferredAt ? "已转" : "未转"}
                  </span>
                </div>
                {row.shopWindowTransferredAt && (
                  <p className="mt-1 text-xs text-slate-400">
                    {row.shopWindowTransferredBy || "未知操作人"} · {new Date(row.shopWindowTransferredAt).toLocaleString("zh-CN")}
                  </p>
                )}
                {row.canOperate && row.shopId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleShopWindowTransfer(row)}
                    className={`mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${row.shopWindowTransferredAt ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-amber-300 text-amber-800 hover:bg-amber-50"}`}
                  >
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                    {row.shopWindowTransferredAt ? "改回未转" : "标记已转"}
                  </button>
                )}
                <div className="mt-3 border-t border-slate-100 pt-2">
                {row.trackingNo ? (
                  <>
                    <p className="truncate font-semibold text-slate-800">{row.carrier || "未填写物流商"}</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{row.trackingNo}</p>
                    {row.canOperate && <button type="button" onClick={() => setEditingTrackingId(row.orderId)} className="mt-2 text-xs font-semibold text-amber-700 hover:text-amber-900">修改物流单号</button>}
                  </>
                ) : <p className="text-xs text-slate-400">尚未回填物流资料</p>}
                </div>
              </div>

              <div>
                {!row.canOperate ? (
                  <span className="text-xs text-slate-400">当前账号无发货操作权限</span>
                ) : editingTrackingId === row.orderId || step === "TRACKING" ? (
                  <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void saveTracking(row, event.currentTarget); }}>
                    <input name="carrier" required defaultValue={row.carrier ?? ""} placeholder="物流商" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-amber-500 focus:outline-none" />
                    <input name="trackingNo" required defaultValue={row.trackingNo ?? ""} placeholder="物流单号" className="h-10 min-w-0 flex-[1.4] rounded-lg border border-slate-200 px-3 font-mono text-sm focus:border-amber-500 focus:outline-none" />
                    <button disabled={busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Truck size={16} />}保存</button>
                    {row.trackingNo && <button type="button" onClick={() => setEditingTrackingId(null)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600">取消</button>}
                  </form>
                ) : step === "PROOF" ? (
                  <div
                    tabIndex={busy ? -1 : 0}
                    role="button"
                    aria-label={`为订单 ${row.orderNo} 拖入或粘贴发货截图`}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                    onDrop={(event) => { event.preventDefault(); if (!busy) void uploadProof(row, event.dataTransfer.files?.[0] ?? null); }}
                    onPaste={(event) => { const file = pastedImage(event); if (file && !busy) { event.preventDefault(); void uploadProof(row, file); } }}
                    className="group flex min-h-24 items-center gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 outline-none transition hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
                      {busy ? <LoaderCircle size={19} className="animate-spin" /> : <ImagePlus size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">拖入图片，或 Ctrl+V 粘贴截图</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><ClipboardPaste size={12} />支持截图粘贴</span><span>JPG / PNG / WebP</span></p>
                    </div>
                    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">
                      <Upload size={14} />选择文件
                      <input type="file" className="sr-only" disabled={busy} accept=".png,.jpg,.jpeg,.webp,.pdf,.mp4,image/png,image/jpeg,image/webp,application/pdf,video/mp4" onChange={(event) => void uploadProof(row, event.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                ) : step === "TRANSFER" ? (
                  <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">请先将窗口状态标记为“已转”，才能确认发货。</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void confirmShipment(row)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <PackageCheck size={17} />}确认发货</button>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已上传 {row.proofCount} 份凭证</span>
                    <Link href={`/admin/orders/${row.orderId}#shipment-proof`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ExternalLink size={13} />查看凭证</Link>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {!rows.length && <div className="px-5 py-14 text-center text-sm text-slate-400">当前没有待发货订单</div>}
      </div>
    </section>
  );
}
