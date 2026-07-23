"use client";

import { useState } from "react";
import { zh } from "@/lib/i18n";

type Props = {
  shipmentId: string;
};

type EventStatus = "SHIPMENT_CREATED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED" | "EXCEPTION" | "CANCELED";

const eventTypes: EventStatus[] = ["SHIPMENT_CREATED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "EXCEPTION", "CANCELED"];

export default function ShipmentEventForm({ shipmentId }: Props) {
  const [eventType, setEventType] = useState<EventStatus>("IN_TRANSIT");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, memo: memo || undefined }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || payload?.error || "更新失败。");
      setLoading(false);
      return;
    }
    setMessage("物流事件已保存，正在刷新...");
    setLoading(false);
    window.location.reload();
  }

  return (
    <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <h3 className="mb-1 font-bold text-slate-900">新增物流事件</h3>
      <p className="mb-4 text-xs text-slate-500">记录承运商最新轨迹，更新后将进入订单时间线。</p>
      <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
        <span>物流状态</span>
        <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={eventType} onChange={(e) => setEventType(e.target.value as EventStatus)}>
          {eventTypes.map((item) => (
            <option key={item} value={item}>
              {zh(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
        <span>备注</span>
        <textarea className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} placeholder="填写地点、状态说明或异常原因" />
      </label>
      <button className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700 disabled:opacity-70" disabled={loading} type="submit">
        {loading ? "保存中..." : "保存物流事件"}
      </button>
      {message && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>}
    </form>
  );
}
