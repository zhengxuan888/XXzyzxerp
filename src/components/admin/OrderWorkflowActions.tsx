"use client";

import { useState } from "react";
import { zh } from "@/lib/i18n";

type WorkflowAction = "submit" | "approve" | "reject" | "void" | "ship";

type Props = {
  orderId: string;
  currentStatus: string;
  permissions: {
    submit: boolean;
    reviewApprove: boolean;
    reviewReject: boolean;
    ship: boolean;
    cancel?: boolean;
  };
  reviewClaimedByMe?: boolean;
  reviewRejectReasons?: string[];
  voidReasons?: string[];
  shippingChecklist?: {
    hasShipment: boolean;
    hasTrackingNo: boolean;
    hasProof: boolean;
  };
};

const actionLabel = {
  submit: "提交核单",
  approve: "核单通过",
  reject: "核单退回",
  void: "作废",
  ship: "确认发货",
} as const;

export default function OrderWorkflowActions({
  orderId,
  currentStatus,
  permissions,
  reviewClaimedByMe = false,
  reviewRejectReasons = [],
  voidReasons = [],
  shippingChecklist,
}: Props) {
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const available: WorkflowAction[] = [];
  if (currentStatus === "DRAFT" && permissions.submit) {
    available.push("submit");
  }
  if (currentStatus === "SUBMITTED") {
    if (reviewClaimedByMe && permissions.reviewApprove) available.push("approve");
    if (reviewClaimedByMe && permissions.reviewReject) available.push("reject");
    if (reviewClaimedByMe && permissions.cancel) available.push("void");
  }
  if (currentStatus === "WAITING_SHIPMENT") {
    if (permissions.cancel) available.push("void");
    if (
      permissions.ship
      && shippingChecklist?.hasShipment
      && shippingChecklist.hasTrackingNo
      && shippingChecklist.hasProof
    ) available.push("ship");
  }
  if (currentStatus === "EXCEPTION" && permissions.cancel) {
    available.push("void");
  }

  async function execute() {
    if (!action) return;
    setLoading(true);
    setMessage(null);

    const response = await fetch(`/api/mvp/orders/${orderId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(payload?.error?.message || payload?.error || "操作失败");
      setLoading(false);
      return;
    }

    setMessage("操作成功，正在刷新...");
    window.location.reload();
  }

  return (
    <section className="rounded border border-gray-200 p-4">
      <h2 className="font-medium">订单流程</h2>
      <p className="mt-1 text-sm text-gray-500">当前状态：{zh(currentStatus)}</p>
      {currentStatus === "WAITING_SHIPMENT" && permissions.ship && shippingChecklist && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">发货进度</p>
            <span className="text-xs text-slate-500">按顺序完成后即可确认发货</span>
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            {[
              ["1", "回填物流单号", shippingChecklist.hasShipment && shippingChecklist.hasTrackingNo],
              ["2", "上传发货凭证", shippingChecklist.hasProof],
              ["3", "确认发货", shippingChecklist.hasShipment && shippingChecklist.hasTrackingNo && shippingChecklist.hasProof],
            ].map(([step, label, complete]) => (
              <span key={String(label)} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 font-semibold ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${complete ? "bg-emerald-600 text-white" : "bg-white text-amber-800"}`}>{complete ? "✓" : step}</span>
                {label}
              </span>
            ))}
          </div>
          {(!shippingChecklist.hasShipment || !shippingChecklist.hasTrackingNo || !shippingChecklist.hasProof) && (
            <p className="mt-3 text-xs text-amber-800">
              {!shippingChecklist.hasTrackingNo ? "请先在待发货工作台回传物流单号。" : !shippingChecklist.hasProof ? "物流单号已回填，请在下方上传发货凭证。" : "完成以上步骤后即可确认发货。"}
            </p>
          )}
        </div>
      )}
      {available.length === 0 ? (
        <>
          <p className="mt-4 text-sm text-gray-500">当前状态下暂无可执行动作。</p>
          {currentStatus === "SUBMITTED" && (permissions.reviewApprove || permissions.reviewReject || permissions.cancel) && !reviewClaimedByMe && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              请先领取该订单；领取人上传核单凭证后才能通过或退回。
            </p>
          )}
        </>
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

          {(action === "reject" || action === "void") && (
            <label className="mt-4 grid gap-1 text-sm">
              <span>{action === "reject" ? "请输入核单退回原因" : "请输入作废原因"}</span>
              <div className="flex flex-wrap gap-2">
                {(action === "reject" ? reviewRejectReasons : voidReasons).map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setNote(reason)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      note === reason
                        ? "border-amber-500 bg-amber-50 font-semibold text-amber-900"
                        : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <textarea
                className="min-h-20 rounded border border-gray-300 px-3 py-2"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}

          {action === "ship" && (
            <p className="mt-2 text-xs text-gray-500">确认发货前请先上传出货凭证（图片/视频/PDF）。</p>
          )}

          <button
            type="button"
            disabled={!action || loading || ((action === "reject" || action === "void") && !note.trim())}
            onClick={execute}
            className="mt-4 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "提交中..." : action ? actionLabel[action] : "选择动作"}
          </button>
        </>
      )}
      {message && <p className="mt-3 text-sm text-blue-700">{message}</p>}
    </section>
  );
}
