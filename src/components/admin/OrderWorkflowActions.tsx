"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  currentStatus: string;
  permissions: {
    submit: boolean;
    review: boolean;
    ship: boolean;
  };
};

const actionLabel = {
  submit: "提交核单",
  approve: "核单通过",
  reject: "核单驳回",
  ship: "确认发货并开始跟踪",
} as const;

export default function OrderWorkflowActions({ orderId, currentStatus, permissions }: Props) {
  const [action, setAction] = useState<keyof typeof actionLabel | null>(null);
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const available =
    currentStatus === "DRAFT" && permissions.submit
      ? (["submit"] as const)
      : currentStatus === "SUBMITTED" && permissions.review
        ? (["approve", "reject"] as const)
        : currentStatus === "WAITING_SHIPMENT" && permissions.ship
          ? (["ship"] as const)
          : ([] as const);

  async function execute() {
    if (!action) return;
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/mvp/orders/${orderId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, carrier, trackingNo }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "操作失败。");
      setLoading(false);
      return;
    }
    setMessage("操作成功，正在刷新...");
    window.location.reload();
  }

  return (
    <section className="rounded border border-gray-200 p-4">
      <h2 className="font-medium">订单流程操作</h2>
      <p className="mt-1 text-sm text-gray-500">当前状态：{currentStatus}</p>
      {available.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">当前状态没有可执行操作，或当前岗位没有对应权限。</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {available.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setAction(item)}
                className={`rounded border px-3 py-2 text-sm ${action === item ? "border-amber-500 bg-amber-50 text-amber-900" : "border-gray-300"}`}
              >
                {actionLabel[item]}
              </button>
            ))}
          </div>
          {action === "ship" && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>承运商 *</span>
                <input className="rounded border border-gray-300 px-3 py-2" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>物流单号 *</span>
                <input className="rounded border border-gray-300 px-3 py-2" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} />
              </label>
            </div>
          )}
          {action && (
            <label className="mt-4 grid gap-1 text-sm">
              <span>{action === "reject" ? "驳回原因 *" : "操作备注"}</span>
              <textarea className="min-h-20 rounded border border-gray-300 px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          )}
          <button
            type="button"
            disabled={!action || loading}
            onClick={execute}
            className="mt-4 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "处理中..." : action ? actionLabel[action] : "请选择操作"}
          </button>
        </>
      )}
      {message && <p className="mt-3 text-sm text-blue-700">{message}</p>}
    </section>
  );
}
