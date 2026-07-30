"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export default function OrderReviewClaimButton({ orderId, claimedByMe, claimedByName }: { orderId: string; claimedByMe: boolean; claimedByName?: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function update(action: "claim" | "release") {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/mvp/orders/${orderId}/review-claim`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (response.ok) {
      router.refresh();
      return;
    }
    const messages: Record<string, string> = {
      ORDER_ALREADY_CLAIMED: "该订单刚刚已被其他核单人员领取。",
      NOT_CLAIM_OWNER: "该订单不是由你领取，无法释放。",
      ORDER_NOT_REVIEWABLE: "订单状态已经变化，当前不能领取。",
      FORBIDDEN: "当前账号没有该订单的核单权限。",
    };
    setMessage(messages[payload?.error] ?? payload?.error?.message ?? "操作失败，请刷新后重试。");
  }
  if (claimedByName && !claimedByMe) return <span className="text-sm font-semibold text-amber-700">当前由 {claimedByName} 审核</span>;
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant={claimedByMe ? "ghost" : "outline"} disabled={saving} onClick={() => void update(claimedByMe ? "release" : "claim")}>
        {saving ? "处理中…" : claimedByMe ? "释放核单" : "领取核单"}
      </Button>
      {message && <p role="alert" className="text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
}
