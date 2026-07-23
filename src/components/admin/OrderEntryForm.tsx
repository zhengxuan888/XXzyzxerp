"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Package, Search, Sparkles, WalletCards } from "lucide-react";
import type { OrderTemplateConfiguration } from "@/lib/order-template";

type Option = { id: string; code: string; name: string };
type ProductOption = Option & { skus: { id: string; code: string }[] };
type TemplateOption = Option & { configuration: OrderTemplateConfiguration; isDefault: boolean };

export default function OrderEntryForm({
  customers,
  products,
  templates,
  canCreate,
}: {
  customers: Option[];
  products: ProductOption[];
  templates: TemplateOption[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const defaultTemplate = templates.find((item) => item.isDefault) ?? templates[0];
  const [templateId, setTemplateId] = useState(defaultTemplate?.id ?? "");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const template = templates.find((item) => item.id === templateId) ?? defaultTemplate;
  const config = template?.configuration;
  const selectedProduct = products.find((item) => item.id === selectedProductId);
  const today = new Date().toISOString().slice(0, 10);

  const defaultValues = useMemo(() => ({
    currency: config?.currency ?? "CNY",
    logisticsChannel: config?.logisticsChannel ?? "",
    paymentMethod: config?.paymentMethod ?? "COD",
    shippingFee: ((config?.defaultShippingFeeCents ?? 0) / 100).toFixed(2),
    codAmount: ((config?.defaultCodAmountCents ?? 0) / 100).toFixed(2),
  }), [config]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const moneyToCents = (name: string) => Math.round(Number(data.get(name) || 0) * 100);
    const customFields = Object.fromEntries(
      (config?.customFields ?? []).map((field) => [field.key, data.get(`custom_${field.key}`) ?? ""]),
    );
    const payload = {
      orderTemplateId: templateId || undefined,
      customerId: String(data.get("customerId") ?? ""),
      productId: selectedProductId,
      skuId: String(data.get("skuId") ?? ""),
      productName: selectedProduct?.name ?? "",
      quantity: Number(data.get("quantity") ?? 1),
      unitPriceCents: moneyToCents("unitPrice"),
      codAmountCents: moneyToCents("codAmount"),
      shippingFeeCents: moneyToCents("shippingFee"),
      currency: String(data.get("currency") ?? defaultValues.currency),
      logisticsChannel: String(data.get("logisticsChannel") ?? ""),
      recipientName: String(data.get("recipientName") ?? ""),
      recipientPhone: String(data.get("recipientPhone") ?? ""),
      recipientCountryCode: String(data.get("recipientCountryCode") ?? ""),
      recipientPostalCode: String(data.get("recipientPostalCode") ?? ""),
      recipientRegion: String(data.get("recipientRegion") ?? ""),
      recipientCity: String(data.get("recipientCity") ?? ""),
      recipientAddress: String(data.get("recipientAddress") ?? ""),
      packageWeightGrams: Math.round(Number(data.get("packageWeightKg") || 0) * 1000),
      paymentMethod: String(data.get("paymentMethod") ?? defaultValues.paymentMethod),
      customerWhatsapp: String(data.get("customerWhatsapp") ?? ""),
      staffWhatsapp: String(data.get("staffWhatsapp") ?? ""),
      orderedAt: String(data.get("orderedAt") ?? today),
      note: String(data.get("note") ?? ""),
      customFields,
    };
    const response = await fetch("/api/mvp/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error?.message ?? result?.error ?? "订单保存失败，请检查必填项。");
      setSaving(false);
      return;
    }
    router.push(`/admin/orders/${result.data.id}`);
  }

  const input = "h-10 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-violet-100 bg-[#fffaf7] p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={<Package size={18} />} label="今日订单" value="—" color="text-blue-600 bg-blue-50" />
        <Metric icon={<WalletCards size={18} />} label="本单申报金额" value="录入后计算" color="text-emerald-600 bg-emerald-50" />
        <Metric icon={<CalendarDays size={18} />} label="录入日期" value={today} color="text-violet-600 bg-violet-50" />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-white px-3">
        <Search size={16} className="text-gray-400" />
        <input className="h-10 flex-1 outline-none" placeholder="搜索订单号、收件人（订单保存后可用）" disabled />
      </div>

      <div className="rounded-2xl border-2 border-violet-100 bg-white/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-violet-700"><Sparkles size={16} />订单模板</span>
          <select className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        <Section title="订单信息">
          <Field label="客户" required><select name="customerId" required className={input}><option value="">请选择客户</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field>
          <Field label="品名" required><select name="productId" required className={input} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}><option value="">输入关键词搜索商品</option>{products.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field>
          <Field label="SKU" required={config?.requireSku}><select name="skuId" required={config?.requireSku} className={input}><option value="">请选择 SKU</option>{selectedProduct?.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.code}</option>)}</select></Field>
          <Field label="物流渠道"><input name="logisticsChannel" className={input} defaultValue={defaultValues.logisticsChannel} key={`${templateId}-logistics`} placeholder="例如：东泽" /></Field>
          <Field label="数量" required><input name="quantity" type="number" min="1" defaultValue="1" required className={input} /></Field>
          <Field label="商品单价"><input name="unitPrice" type="number" min="0" step="0.01" defaultValue="0.00" required className={input} /></Field>
          <Field label="币种"><input name="currency" maxLength={3} defaultValue={defaultValues.currency} key={`${templateId}-currency`} className={input} /></Field>
          <Field label="订单日期"><input name="orderedAt" type="date" defaultValue={today} className={input} /></Field>
        </Section>

        <Section title="收件人信息">
          <Field label="收件人姓名" required><input name="recipientName" required className={input} placeholder="收件人姓名" /></Field>
          <Field label="电话" required={config?.requireRecipientPhone}><input name="recipientPhone" required={config?.requireRecipientPhone} className={input} placeholder="收件人电话" /></Field>
          <Field label="国家代码"><input name="recipientCountryCode" className={input} placeholder="例如：DE" /></Field>
          <Field label="重量（kg）"><input name="packageWeightKg" type="number" min="0" step="0.001" className={input} defaultValue="0" /></Field>
          <Field label="邮编"><input name="recipientPostalCode" className={input} placeholder="邮编" /></Field>
          <Field label="区/省"><input name="recipientRegion" className={input} placeholder="区/省" /></Field>
          <Field label="城市"><input name="recipientCity" className={input} placeholder="城市" /></Field>
          <Field label="详细地址" wide required={config?.requireRecipientAddress}><input name="recipientAddress" required={config?.requireRecipientAddress} className={input} placeholder="请输入详细街道地址" /></Field>
        </Section>

        <Section title="收款信息">
          <Field label="COD 金额" required={config?.requireCodAmount}><input name="codAmount" type="number" min="0" step="0.01" defaultValue={defaultValues.codAmount} key={`${templateId}-cod`} className={input} /></Field>
          <Field label="运费"><input name="shippingFee" type="number" min="0" step="0.01" defaultValue={defaultValues.shippingFee} key={`${templateId}-shipping`} className={input} /></Field>
          <Field label="付款方式"><select name="paymentMethod" defaultValue={defaultValues.paymentMethod} key={`${templateId}-payment`} className={input}><option value="COD">到付（COD）</option><option value="PREPAID">预付</option></select></Field>
          <Field label="客户 WhatsApp"><input name="customerWhatsapp" className={input} placeholder="客户 WhatsApp" /></Field>
          <Field label="员工 WhatsApp"><input name="staffWhatsapp" className={input} placeholder="员工 WhatsApp" /></Field>
          <Field label="备注" wide><input name="note" className={input} placeholder="备注信息" /></Field>
          {(config?.customFields ?? []).map((field) => (
            <Field key={field.key} label={field.label} required={field.required}>
              <input name={`custom_${field.key}`} type={field.type} required={field.required} className={input} />
            </Field>
          ))}
        </Section>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button disabled={!canCreate || saving} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50">
          <Check size={18} />{saving ? "正在保存…" : "确认订单"}
        </button>
      </div>
    </form>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm"><span className={`rounded-xl p-2 ${color}`}>{icon}</span><span><small className="block text-gray-500">{label}</small><strong className="text-lg">{value}</strong></span></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="mb-5 grid gap-3 md:grid-cols-4"><legend className="col-span-full mb-2 text-sm font-semibold text-violet-700">— {title}</legend>{children}</fieldset>;
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return <label className={`space-y-1 text-sm text-gray-700 ${wide ? "md:col-span-2" : ""}`}><span>{label}{required && <b className="ml-1 text-red-500">*</b>}</span>{children}</label>;
}
