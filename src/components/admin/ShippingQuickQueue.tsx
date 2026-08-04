"use client";

import { CheckCircle2, ExternalLink, LoaderCircle, PackageCheck, Truck, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type QueueRow = {
  orderId: string;
  orderNo: string;
  employee: string;
  recipient: string;
  country: string;
  productSummary: string;
  shipmentId: string | null;
  carrier: string | null;
  trackingNo: string | null;
  proofCount: number;
  canOperate: boolean;
};

export default function ShippingQuickQueue({ rows }: { rows: QueueRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
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
    window.location.reload();
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
    window.location.reload();
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
    window.location.reload();
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
          const step = !row.trackingNo ? "TRACKING" : row.proofCount < 1 ? "PROOF" : "CONFIRM";
          return (
            <article key={row.orderId} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(280px,1.2fr)_minmax(260px,1fr)_minmax(420px,1.5fr)] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/orders/${row.orderId}`} className="font-bold text-slate-950 hover:text-amber-700">{row.orderNo}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${step === "TRACKING" ? "bg-amber-50 text-amber-700" : step === "PROOF" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {step === "TRACKING" ? "待物流单号" : step === "PROOF" ? "待发货凭证" : "可确认发货"}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{row.productSummary || "-"}</p>
                <p className="mt-1 text-xs text-slate-400">{row.employee} · {row.recipient} · {row.country}</p>
              </div>

              <div className="min-w-0 text-sm">
                {row.trackingNo ? (
                  <>
                    <p className="truncate font-semibold text-slate-800">{row.carrier || "未填写物流商"}</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{row.trackingNo}</p>
                  </>
                ) : <p className="text-xs text-slate-400">尚未回填物流资料</p>}
              </div>

              <div>
                {!row.canOperate ? (
                  <span className="text-xs text-slate-400">当前账号无发货操作权限</span>
                ) : step === "TRACKING" ? (
                  <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void saveTracking(row, event.currentTarget); }}>
                    <input name="carrier" required placeholder="物流商" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-amber-500 focus:outline-none" />
                    <input name="trackingNo" required placeholder="物流单号" className="h-10 min-w-0 flex-[1.4] rounded-lg border border-slate-200 px-3 font-mono text-sm focus:border-amber-500 focus:outline-none" />
                    <button disabled={busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Truck size={16} />}保存</button>
                  </form>
                ) : step === "PROOF" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                      {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}上传发货凭证
                      <input type="file" className="sr-only" disabled={busy} accept=".png,.jpg,.jpeg,.webp,.pdf,.mp4,image/png,image/jpeg,image/webp,application/pdf,video/mp4" onChange={(event) => void uploadProof(row, event.target.files?.[0] ?? null)} />
                    </label>
                    <span className="text-xs text-slate-400">图片、PDF 或视频</span>
                  </div>
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
