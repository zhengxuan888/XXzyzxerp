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
    <form className="rounded border border-gray-200 p-4" onSubmit={onSubmit}>
      <h3 className="mb-3 font-medium">新增物流事件</h3>
      <label className="mb-3 flex flex-col gap-2 text-sm text-gray-700">
        <span>物流状态</span>
        <select className="rounded border border-gray-300 px-2 py-2" value={eventType} onChange={(e) => setEventType(e.target.value as EventStatus)}>
          {eventTypes.map((item) => (
            <option key={item} value={item}>
              {zh(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 flex flex-col gap-2 text-sm text-gray-700">
        <span>备注</span>
        <textarea className="rounded border border-gray-300 px-2 py-2" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} />
      </label>
      <button className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-70" disabled={loading} type="submit">
        {loading ? "保存中..." : "保存物流事件"}
      </button>
      {message && <p className="mt-2 text-sm text-blue-700">{message}</p>}
    </form>
  );
}
