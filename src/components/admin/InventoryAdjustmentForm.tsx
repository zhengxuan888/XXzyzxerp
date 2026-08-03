"use client";

import { FormEvent, useState } from "react";

function inventoryRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `inventory-${crypto.randomUUID()}`;
  }
  return `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function InventoryAdjustmentForm({
  sites,
  skus,
  canAdjust,
}: {
  sites: { id: string; label: string }[];
  skus: { id: string; label: string }[];
  canAdjust: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  if (!canAdjust) return <p className="text-sm text-gray-500">无库存调整权限。</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/mvp/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: form.get("siteId"),
        skuId: form.get("skuId"),
        quantityDelta: Number(form.get("quantityDelta")),
        reason: form.get("reason"),
        idempotencyKey: inventoryRequestKey(),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "库存调整失败。");
      return;
    }
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
      <select name="siteId" required className="rounded border border-gray-300 px-3 py-2">
        <option value="">选择站点</option>
        {sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
      </select>
      <select name="skuId" required className="rounded border border-gray-300 px-3 py-2">
        <option value="">选择 SKU</option>
        {skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.label}</option>)}
      </select>
      <input name="quantityDelta" required type="number" step="1" placeholder="调整数量，入库为正" className="rounded border border-gray-300 px-3 py-2" />
      <input name="reason" required placeholder="调整原因" className="rounded border border-gray-300 px-3 py-2" />
      <button className="rounded bg-gray-950 px-4 py-2 text-sm font-medium text-white md:col-span-4">提交库存调整</button>
      {message && <p className="text-sm text-red-600 md:col-span-4">{message}</p>}
    </form>
  );
}
