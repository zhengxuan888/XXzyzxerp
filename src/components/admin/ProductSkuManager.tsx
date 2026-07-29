"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

type Sku = { id: string; code: string; barcode: string | null; isActive: boolean };

export default function ProductSkuManager({ productId, skus, canCreate, canUpdate }: {
  productId: string;
  skus: Sku[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, skuId?: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      code: String(data.get("code") ?? "").trim(),
      barcode: String(data.get("barcode") ?? "").trim() || null,
      isActive: data.get("isActive") === "on",
    };
    try {
      const response = await fetch(skuId ? `/api/mvp/products/${productId}/skus/${skuId}` : `/api/mvp/products/${productId}/skus`, {
        method: skuId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? result?.error ?? "保存失败");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div><h2 className="font-bold text-slate-950">SKU 管理</h2><p className="mt-1 text-xs text-slate-500">SKU 编码用于订单、库存和物流匹配，停用不会删除历史数据。</p></div>
        {canCreate && <button type="button" onClick={() => setEditing(editing === "new" ? null : "new")} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-3 text-sm font-semibold text-white"><Plus size={15} />新增 SKU</button>}
      </header>
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {editing === "new" && <SkuForm busy={busy} onSubmit={(event) => save(event)} onCancel={() => setEditing(null)} />}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">SKU 编码</th><th className="px-3 py-2">条码</th><th className="px-3 py-2">状态</th><th className="px-3 py-2 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {skus.map((sku) => (
              <tr key={sku.id}>
                <td className="px-3 py-3 font-semibold">{sku.code}</td><td className="px-3 py-3">{sku.barcode ?? "-"}</td>
                <td className="px-3 py-3">{sku.isActive ? "启用" : "停用"}</td>
                <td className="px-3 py-3 text-right">{canUpdate && <button type="button" onClick={() => setEditing(editing === sku.id ? null : sku.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"><Pencil size={14} />编辑</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {typeof editing === "string" && editing !== "new" && (() => {
        const sku = skus.find((item) => item.id === editing);
        return sku ? <SkuForm initial={sku} busy={busy} onSubmit={(event) => save(event, sku.id)} onCancel={() => setEditing(null)} /> : null;
      })()}
    </section>
  );
}

function SkuForm({ initial, busy, onSubmit, onCancel }: { initial?: Sku; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const input = "h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-violet-400";
  return <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
    <label className="grid gap-1 text-xs font-semibold">SKU 编码<input name="code" required defaultValue={initial?.code} className={input} /></label>
    <label className="grid gap-1 text-xs font-semibold">条码（可选）<input name="barcode" defaultValue={initial?.barcode ?? ""} className={input} /></label>
    <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} />启用 SKU</label>
    <div className="flex gap-2 md:col-span-3"><button disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">{busy && <LoaderCircle size={14} className="animate-spin" />}保存</button><button type="button" onClick={onCancel} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm">取消</button></div>
  </form>;
}
