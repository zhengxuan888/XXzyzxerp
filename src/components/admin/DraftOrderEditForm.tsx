"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; skus: { id: string; code: string }[] };
type InitialOrder = {
  id: string; shopId: string; productId: string; skuId: string; productName: string;
  quantity: number; unitPriceCents: number; codAmountCents: number; shippingFeeCents: number;
  currency: string; orderedAt: string; recipientName: string; recipientPhone: string;
  recipientEmail: string; recipientCountryCode: string; recipientPostalCode: string;
  recipientRegion: string; recipientCity: string; recipientAddress: string;
  customerWhatsapp: string; staffWhatsapp: string; packageWeightGrams: number;
  paymentMethod: string; logisticsChannel: string; note: string; returnReason: string;
};

export default function DraftOrderEditForm({ order, products, countries }: { order: InitialOrder; products: Product[]; countries: { code: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(order.productId);
  const [skuId, setSkuId] = useState(order.skuId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const product = products.find((item) => item.id === productId);
  const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const cents = (name: string) => Math.round(Number(data.get(name) || 0) * 100);
    const response = await fetch("/api/mvp/orders", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: order.id, shopId: data.get("shopId"), productId, skuId,
        productName: product?.skus.find((item) => item.id === skuId)?.code || product?.name || order.productName,
        quantity: Number(data.get("quantity")), unitPriceCents: cents("unitPrice"),
        codAmountCents: cents("codAmount"), shippingFeeCents: cents("shippingFee"),
        currency: data.get("currency"), orderedAt: data.get("orderedAt"),
        recipientName: data.get("recipientName"), recipientPhone: data.get("recipientPhone"),
        recipientEmail: data.get("recipientEmail"), recipientCountryCode: data.get("recipientCountryCode"),
        recipientPostalCode: data.get("recipientPostalCode"), recipientRegion: data.get("recipientRegion"),
        recipientCity: data.get("recipientCity"), recipientAddress: data.get("recipientAddress"),
        customerWhatsapp: data.get("customerWhatsapp"), staffWhatsapp: data.get("staffWhatsapp"),
        packageWeightGrams: Math.round(Number(data.get("packageWeightKg") || 0) * 1000),
        paymentMethod: data.get("paymentMethod"), logisticsChannel: data.get("logisticsChannel"), note: data.get("note"),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setMessage(payload?.error?.message || payload?.error || "保存失败"); setSaving(false); return; }
    setMessage("修改已保存，可以重新提交核单。"); setSaving(false); setOpen(false); router.refresh();
  }

  if (!open) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="font-semibold text-rose-900">该订单已退回，请修改后重新提交</p><p className="mt-1 text-sm text-rose-700">退回原因：{order.returnReason || "请核对订单资料"}</p><button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white">修改订单</button>{message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}</div>;

  return <form onSubmit={save} className="space-y-4 rounded-2xl border border-amber-300 bg-white p-5 shadow-sm">
    <div><h2 className="font-bold text-slate-950">修改退回订单</h2><p className="mt-1 text-xs text-slate-500">保存后仍为草稿，确认无误后再提交核单。</p></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Label text="比特窗口号（店铺 ID）"><input required name="shopId" defaultValue={order.shopId} className={field}/></Label>
      <Label text="商品"><select required value={productId} onChange={(e) => { setProductId(e.target.value); setSkuId(""); }} className={field}><option value="">选择商品</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Label>
      <Label text="SKU"><select required value={skuId} onChange={(e) => setSkuId(e.target.value)} className={field}><option value="">选择 SKU</option>{product?.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.code}</option>)}</select></Label>
      <Label text="数量"><input required min="1" type="number" name="quantity" defaultValue={order.quantity} className={field}/></Label>
      <Label text="申报金额"><input required min="0" step="0.01" type="number" name="unitPrice" defaultValue={(order.unitPriceCents / 100).toFixed(2)} className={field}/></Label>
      <Label text="COD 金额"><input min="0" step="0.01" type="number" name="codAmount" defaultValue={(order.codAmountCents / 100).toFixed(2)} className={field}/></Label>
      <Label text="运费"><input min="0" step="0.01" type="number" name="shippingFee" defaultValue={(order.shippingFeeCents / 100).toFixed(2)} className={field}/></Label>
      <Label text="币种"><input required maxLength={3} name="currency" defaultValue={order.currency} className={field}/></Label>
      <Label text="订单日期"><input type="date" name="orderedAt" defaultValue={order.orderedAt} className={field}/></Label>
      <Label text="收件人"><input required name="recipientName" defaultValue={order.recipientName} className={field}/></Label>
      <Label text="电话"><input name="recipientPhone" defaultValue={order.recipientPhone} className={field}/></Label>
      <Label text="邮箱"><input type="email" name="recipientEmail" defaultValue={order.recipientEmail} className={field}/></Label>
      <Label text="国家"><select name="recipientCountryCode" defaultValue={order.recipientCountryCode} className={field}><option value="">选择国家</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></Label>
      <Label text="邮编"><input name="recipientPostalCode" defaultValue={order.recipientPostalCode} className={field}/></Label>
      <Label text="州/区域"><input name="recipientRegion" defaultValue={order.recipientRegion} className={field}/></Label>
      <Label text="城市"><input name="recipientCity" defaultValue={order.recipientCity} className={field}/></Label>
      <Label text="详细地址" wide><input name="recipientAddress" defaultValue={order.recipientAddress} className={field}/></Label>
      <Label text="客户 WhatsApp"><input name="customerWhatsapp" defaultValue={order.customerWhatsapp} className={field}/></Label>
      <Label text="员工 WhatsApp"><input name="staffWhatsapp" defaultValue={order.staffWhatsapp} className={field}/></Label>
      <Label text="重量（kg）"><input min="0" step="0.001" type="number" name="packageWeightKg" defaultValue={(order.packageWeightGrams / 1000).toString()} className={field}/></Label>
      <Label text="付款方式"><select name="paymentMethod" defaultValue={order.paymentMethod} className={field}><option value="COD">到付</option><option value="PREPAID">预付</option></select></Label>
      <Label text="物流渠道"><input name="logisticsChannel" defaultValue={order.logisticsChannel} className={field}/></Label>
      <Label text="备注" wide><input name="note" defaultValue={order.note} className={field}/></Label>
    </div>
    {message && <p className="text-sm text-rose-700">{message}</p>}
    <div className="flex gap-2"><button disabled={saving} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "保存中…" : "保存修改"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">取消</button></div>
  </form>;
}

function Label({ text, wide, children }: { text: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`grid gap-1 text-sm font-medium text-slate-700 ${wide ? "md:col-span-2" : ""}`}><span>{text}</span>{children}</label>;
}
