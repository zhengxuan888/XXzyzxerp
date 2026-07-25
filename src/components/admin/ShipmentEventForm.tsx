"use client";

import { useState } from "react";
import { zh } from "@/lib/i18n";

type Props = {
  shipmentId: string;
};

type EventStatus =
  | "SHIPMENT_CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "ADDRESS_ERROR"
  | "CUSTOMER_ABSENT"
  | "REFUSED"
  | "RETURNING"
  | "RETURNED"
  | "CANCELED";

const eventTypes: EventStatus[] = [
  "SHIPMENT_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
  "ADDRESS_ERROR",
  "CUSTOMER_ABSENT",
  "REFUSED",
  "RETURNING",
  "RETURNED",
  "CANCELED",
];

export default function ShipmentEventForm({ shipmentId }: Props) {
  const [eventType, setEventType] = useState<EventStatus>("IN_TRANSIT");
  const [memo, setMemo] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionSeverity, setExceptionSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const needReason = eventType === "EXCEPTION" || eventType === "ADDRESS_ERROR" || eventType === "CUSTOMER_ABSENT" || eventType === "REFUSED";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    if (needReason && !exceptionReason.trim()) {
      setMessage("请输入异常原因");
      return;
    }

    const response = await fetch(`/api/mvp/shipments/${shipmentId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        memo: memo || undefined,
        ...(needReason ? { exceptionReason: exceptionReason.trim() } : {}),
        ...(needReason ? { exceptionSeverity } : {}),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || payload?.error || "更新失败");
      setLoading(false);
      return;
    }
    setMessage("事件已记录，正在刷新...");
    setLoading(false);
    window.location.reload();
  }

  return (
    <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <h3 className="mb-1 font-bold text-slate-900">新建物流事件</h3>
      <p className="mb-4 text-xs text-slate-500">
        记录物流节点或异常。异常事件默认前几次可不自动提醒，可在系统配置中调整静默次数（支持按环境变量配置）。
      </p>
      <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
        <span>物流状态</span>
        <select
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          value={eventType}
          onChange={(e) => setEventType(e.target.value as EventStatus)}
        >
          {eventTypes.map((item) => (
            <option key={item} value={item}>
              {zh(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
        <span>备注</span>
        <textarea
          className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={4}
          placeholder="填写处理结果、异常原因、联系结果"
        />
      </label>
      {needReason && (
        <>
          <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span>异常原因（必填）</span>
            <textarea
              className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              rows={3}
              placeholder="请输入异常原因"
            />
          </label>
          <label className="mb-3 flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span>异常等级</span>
            <select
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              value={exceptionSeverity}
              onChange={(event) => setExceptionSeverity(event.target.value as "LOW" | "MEDIUM" | "HIGH")}
            >
              <option value="LOW">低</option>
              <option value="MEDIUM">中</option>
              <option value="HIGH">高</option>
            </select>
          </label>
        </>
      )}
      <button
          className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700 disabled:opacity-70"
          disabled={loading}
          type="submit"
        >
        {loading ? "保存中..." : "保存物流事件"}
      </button>
      {message && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>}
    </form>
  );
}
