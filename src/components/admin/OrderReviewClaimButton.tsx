"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export default function OrderReviewClaimButton({ orderId, claimedByMe, claimedByName }: { orderId: string; claimedByMe: boolean; claimedByName?: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  async function update(action: "claim" | "release") {
    setSaving(true);
    const response = await fetch(`/api/mvp/orders/${orderId}/review-claim`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setSaving(false);
    if (response.ok) router.refresh();
  }
  if (claimedByName && !claimedByMe) return <span className="text-sm font-semibold text-amber-700">当前由 {claimedByName} 审核</span>;
  return <Button type="button" size="sm" variant={claimedByMe ? "ghost" : "outline"} disabled={saving} onClick={() => void update(claimedByMe ? "release" : "claim")}>{saving ? "处理中…" : claimedByMe ? "释放核单" : "领取核单"}</Button>;
}
