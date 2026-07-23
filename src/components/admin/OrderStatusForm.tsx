"use client";

import { useState } from "react";

type OrderStatus = "DRAFT" | "SUBMITTED" | "WAITING_SHIPMENT" | "SHIPPED" | "DELIVERED" | "EXCEPTION" | "COMPLETED" | "CANCELLED";

type Props = {
  orderId: string;
  currentStatus: string;
  canUpdate: boolean;
};

const allStatuses: OrderStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "WAITING_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "EXCEPTION",
  "COMPLETED",
  "CANCELLED",
];

export default function OrderStatusForm({ orderId, currentStatus, canUpdate }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!canUpdate) {
    return <p className="text-sm text-gray-500">No permission for status update.</p>;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/mvp/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: orderId,
        status,
        note: note || undefined,
        exceptionNote: exceptionNote || undefined,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || payload?.error || "Update failed.");
      setLoading(false);
      return;
    }
    setMessage("Order updated, refreshing...");
    setLoading(false);
    window.location.reload();
  }

  return (
    <form className="rounded border border-gray-200 p-4" onSubmit={onSubmit}>
      <h3 className="mb-3 font-medium">Update Order</h3>
      <label className="mb-3 flex flex-col gap-2 text-sm text-gray-700">
        <span>Next Status</span>
        <select className="rounded border border-gray-300 px-2 py-2" value={status} onChange={(event) => setStatus(event.target.value)}>
          {allStatuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 flex flex-col gap-2 text-sm text-gray-700">
        <span>Order Note</span>
        <input
          className="rounded border border-gray-300 px-2 py-2"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label className="mb-3 flex flex-col gap-2 text-sm text-gray-700">
        <span>Exception Note</span>
        <input
          className="rounded border border-gray-300 px-2 py-2"
          value={exceptionNote}
          onChange={(event) => setExceptionNote(event.target.value)}
        />
      </label>
      <button className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-70" disabled={loading} type="submit">
        {loading ? "Saving..." : "Save"}
      </button>
      {message && <p className="mt-2 text-sm text-blue-700">{message}</p>}
    </form>
  );
}
