"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
export default function ShipmentSyncButton({ shipmentId }: { shipmentId: string }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function sync() { setBusy(true); setMessage(""); try { const response = await fetch(`/api/mvp/shipments/${shipmentId}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "DEMO" }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "同步失败"); setMessage(`同步完成：新增 ${payload.data.inserted} 条轨迹`); window.location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "同步失败"); } finally { setBusy(false); } }
  return <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void sync()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""} />{busy ? "同步中..." : "Demo 同步轨迹"}</button>{message && <span className="text-xs text-slate-500">{message}</span>}</div>;
}
