"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, Check, CircleCheck, CircleHelp, CircleX, LoaderCircle, MailCheck, Package, Search, Sparkles, WalletCards } from "lucide-react";
import type { OrderTemplateConfiguration } from "@/lib/order-template";

type Option = { id: string; code: string; name: string };
type CustomerOption = Option & { orderCount: number; lastOrderedAt: string | null };
type ProductOption = Option & { skus: { id: string; code: string }[] };
type TemplateOption = Option & { configuration: OrderTemplateConfiguration; isDefault: boolean };

export default function OrderEntryForm({
  customers,
  products,
  templates,
  canCreate,
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  templates: TemplateOption[];
  canCreate: boolean;
}) {
  const defaultTemplate = templates.find((item) => item.isDefault) ?? templates[0];
  const [templateId, setTemplateId] = useState(defaultTemplate?.id ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const selectedProduct = products.find((item) => item.id === selectedProductId);
  const selectedCustomer = customers.find((item) => item.id === selectedCustomerId);
  const [productName, setProductName] = useState(selectedProduct?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const template = templates.find((item) => item.id === templateId) ?? defaultTemplate;
  const config = template?.configuration;
  const today = new Date().toISOString().slice(0, 10);

  const visibleProducts = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((item) =>
      `${item.code} ${item.name}`.toLowerCase().includes(keyword)
    );
  }, [products, searchKeyword]);

  const defaultValues = useMemo(() => ({
    currency: config?.currency ?? "CNY",
    logisticsChannel: config?.logisticsChannel ?? "",
    paymentMethod: config?.paymentMethod ?? "COD",
    shippingFee: ((config?.defaultShippingFeeCents ?? 0) / 100).toFixed(2),
    codAmount: ((config?.defaultCodAmountCents ?? 0) / 100).toFixed(2),
  }), [config]);

  const selectedProductName = selectedProduct?.name ?? "";
  const finalProductName = productName.trim() || selectedProductName;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    if (config?.requireProductName !== false && !finalProductName) {
      setError("请填写商品名称。");
      return;
    }
    if (!selectedProductId) {
      setError("请先选择商品。");
      return;
    }
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
      customerName: String(data.get("recipientName") ?? ""),
      shopId: String(data.get("shopId") ?? ""),
      productId: selectedProductId,
      skuId: String(data.get("skuId") ?? ""),
      productName: finalProductName,
      quantity: Number(data.get("quantity") ?? 1),
      unitPriceCents: moneyToCents("unitPrice"),
      codAmountCents: moneyToCents("codAmount"),
      shippingFeeCents: moneyToCents("shippingFee"),
      currency: String(data.get("currency") ?? defaultValues.currency),
      logisticsChannel: String(data.get("logisticsChannel") ?? ""),
      recipientName: String(data.get("recipientName") ?? ""),
      recipientPhone: String(data.get("recipientPhone") ?? ""),
      recipientEmail: String(data.get("recipientEmail") ?? ""),
      emailValidationStatus: String(data.get("emailValidationStatus") ?? ""),
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
      setError(result?.error?.message ?? result?.error ?? "订单保存失败");
      setSaving(false);
      return;
    }
    window.location.assign(`/admin/orders/${result.data.id}`);
  }

  const handleProductChange = (nextId: string) => {
    setSelectedProductId(nextId);
    const nextProduct = products.find((item) => item.id === nextId);
    setProductName(nextProduct?.name ?? "");
  };

  const input =
    "h-10 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-violet-100 bg-[#fffaf7] p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={<Package size={18} />} label="订单录入" value="新建订单" color="text-blue-600 bg-blue-50" />
        <Metric icon={<WalletCards size={18} />} label="预计收入" value="输入正确即可提交" color="text-emerald-600 bg-emerald-50" />
        <Metric icon={<CalendarDays size={18} />} label="录入日期" value={today} color="text-violet-600 bg-violet-50" />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-white px-3">
        <Search size={16} className="text-gray-400" />
        <input
          className="h-10 flex-1 outline-none"
          placeholder="搜索客户名称或订单号后可快速筛选"
          disabled
        />
      </div>

      <div className="rounded-2xl border-2 border-violet-100 bg-white/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-violet-700">
            <Sparkles size={16} />
            订单模板
          </span>
          <select className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        <Section title="订单信息">
          <Field label="历史客户匹配（可选）">
            <select name="customerId" className={input} value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
              <option value="">新客/不选择历史档案</option>
              {customers.map((item) => <option key={item.id} value={item.id}>{item.code} / {item.name}</option>)}
            </select>
            {selectedCustomer && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                selectedCustomer.orderCount > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
              }`}>
                {selectedCustomer.orderCount > 0
                  ? `历史客户：当前可见范围内已下单 ${selectedCustomer.orderCount} 次，最近下单 ${selectedCustomer.lastOrderedAt ? new Date(selectedCustomer.lastOrderedAt).toLocaleString("zh-CN") : "-"}。`
                  : "当前可见范围内没有历史订单，可按新客户继续录入。"}
              </p>
            )}
          </Field>
          <Field label="店铺 ID" required><input name="shopId" required className={input} placeholder="旧 ERP 的店铺标识" /></Field>
          <Field label="产品搜索">
            <input
              className={input}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="输入关键字过滤左侧产品"
            />
          </Field>
          <Field label="商品" required>
            <select
              name="productId"
              required
              className={input}
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
            >
              <option value="">请输入并选择商品</option>
              {visibleProducts.map((item) => <option key={item.id} value={item.id}>{item.code} / {item.name}</option>)}
            </select>
          </Field>
            <Field label="商品名称（可手打）" required={config?.requireProductName !== false}>
              <input
                name="productName"
                required={config?.requireProductName !== false}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                className={input}
                list="productNameOptions"
                placeholder="可直接手打商品名称"
            />
            <datalist id="productNameOptions">
              {products.map((item) => <option key={`${item.id}-name`} value={item.name} />)}
            </datalist>
          </Field>
          <Field label="SKU" required={config?.requireSku}>
            <select name="skuId" required={config?.requireSku} className={input}>
              <option value="">选择 SKU</option>
              {selectedProduct?.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.code}</option>)}
            </select>
          </Field>
          <Field label="物流渠道"><input name="logisticsChannel" className={input} defaultValue={defaultValues.logisticsChannel} key={`${templateId}-logistics`} placeholder="可选：如 京东快递" /></Field>
          <Field label="数量" required><input name="quantity" type="number" min="1" defaultValue="1" required className={input} /></Field>
          <Field label="商品金额"><input name="unitPrice" type="number" min="0" step="0.01" defaultValue="0.00" required className={input} /></Field>
          <Field label="币种"><input name="currency" maxLength={3} defaultValue={defaultValues.currency} key={`${templateId}-currency`} className={input} /></Field>
          <Field label="订单日期"><input name="orderedAt" type="date" defaultValue={today} className={input} /></Field>
        </Section>

        <Section title="收件信息">
          <Field label="收件人" required><input name="recipientName" required className={input} placeholder="收件人姓名" /></Field>
          <Field label="电话" required={config?.requireRecipientPhone}>
            <input name="recipientPhone" required={config?.requireRecipientPhone} className={input} placeholder="收件人联系电话" />
          </Field>
          <EmailValidationField inputClass={input} required={config?.requireRecipientEmail !== false} />
          <Field label="国家代码" required={config?.requireRecipientCountryCode}>
            <input name="recipientCountryCode" required={config?.requireRecipientCountryCode} className={input} placeholder="如 CN" />
          </Field>
          <Field label="邮编" required={config?.requireRecipientPostalCode}>
            <input name="recipientPostalCode" required={config?.requireRecipientPostalCode} className={input} placeholder="邮编" />
          </Field>
          <Field label="州/县" required={config?.requireRecipientRegion}>
            <input name="recipientRegion" required={config?.requireRecipientRegion} className={input} placeholder="州/县" />
          </Field>
          <Field label="城市" required={config?.requireRecipientCity}>
            <input name="recipientCity" required={config?.requireRecipientCity} className={input} placeholder="城市" />
          </Field>
          <Field label="详细地址" wide required={config?.requireRecipientAddress}><input name="recipientAddress" required={config?.requireRecipientAddress} className={input} placeholder="建议填写完整地址" /></Field>
        </Section>

        <Section title="支付与物流">
          <Field label="COD 金额" required={config?.requireCodAmount}><input name="codAmount" type="number" min="0" step="0.01" defaultValue={defaultValues.codAmount} key={`${templateId}-cod`} className={input} /></Field>
          <Field label="运费"><input name="shippingFee" type="number" min="0" step="0.01" defaultValue={defaultValues.shippingFee} key={`${templateId}-shipping`} className={input} /></Field>
          <Field label="支付方式">
            <select name="paymentMethod" defaultValue={defaultValues.paymentMethod} key={`${templateId}-payment`} className={input}>
              <option value="COD">货到付款(COD)</option>
              <option value="PREPAID">预付</option>
            </select>
          </Field>
          <Field label="客户 WhatsApp"><input name="customerWhatsapp" className={input} placeholder="客户 WhatsApp" /></Field>
          <Field label="员工 WhatsApp"><input name="staffWhatsapp" className={input} placeholder="员工 WhatsApp" /></Field>
          <Field label="重量(kg)" required={config?.requirePackageWeight}>
            <input
              name="packageWeightKg"
              type="number"
              min={config?.requirePackageWeight ? "0.001" : "0"}
              step="0.001"
              required={config?.requirePackageWeight}
              className={input}
              defaultValue={config?.requirePackageWeight ? "" : "0"}
            />
          </Field>
          <Field label="备注" wide><input name="note" className={input} placeholder="订单备注" /></Field>
          {(config?.customFields ?? []).map((field) => (
            <Field key={field.key} label={field.label} required={field.required}>
              <input name={`custom_${field.key}`} type={field.type} required={field.required} className={input} />
            </Field>
          ))}
        </Section>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button
          disabled={!canCreate || saving}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          <Check size={18} />
          {saving ? "正在保存..." : "确认订单"}
        </button>
      </div>
    </form>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
      <span className={`rounded-xl p-2 ${color}`}>{icon}</span>
      <span><small className="block text-gray-500">{label}</small><strong className="text-lg">{value}</strong></span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 grid gap-3 md:grid-cols-4">
      <legend className="col-span-full mb-2 text-sm font-semibold text-violet-700">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`space-y-1 text-sm text-gray-700 ${wide ? "md:col-span-2" : ""}`}>
      <span>{label}{required && <b className="ml-1 text-red-500">*</b>}</span>
      {children}
    </label>
  );
}

type EmailCheck = {
  name: string;
  label: string;
  passed: boolean;
  detail: string;
};

function EmailValidationField({ inputClass, required }: { inputClass: string; required: boolean }) {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    status: "likely_valid" | "unknown" | "invalid";
    message: string;
    checks?: EmailCheck[];
  } | null>(null);

  async function checkEmail() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setChecking(true);
    setResult(null);
    try {
      const response = await fetch("/api/validate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const payload = await response.json();
      setResult({
        status: payload.status ?? "unknown",
        message: payload.message ?? "无法确认邮箱状态",
        checks: payload.checks,
      });
    } catch {
      setResult({ status: "unknown", message: "检测服务暂时不可用，可稍后重试" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Field label="客户邮箱" required={required}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            name="recipientEmail"
            type="email"
            required={required}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setResult(null);
            }}
            onBlur={() => {
              if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) void checkEmail();
            }}
            className={inputClass}
            placeholder="客户常用邮箱"
          />
          <button
            type="button"
            onClick={checkEmail}
            disabled={checking || !email.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            {checking ? <LoaderCircle size={15} className="animate-spin" /> : <MailCheck size={15} />}
            检测
          </button>
        </div>
        <input type="hidden" name="emailValidationStatus" value={result?.status ?? ""} />
        {result && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <div className="flex flex-wrap gap-1">
              {result.checks?.map((check) => (
                <span
                  key={check.name}
                  title={check.detail}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    check.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {check.passed ? "✓" : "✗"} {check.label}
                </span>
              ))}
            </div>
            <p className={`mt-1 flex items-start gap-1 text-[11px] ${
              result.status === "likely_valid" ? "text-emerald-700" : result.status === "unknown" ? "text-amber-700" : "text-rose-700"
            }`}>
              {result.status === "likely_valid" ? <CircleCheck size={13} /> : result.status === "unknown" ? <CircleHelp size={13} /> : <CircleX size={13} />}
              {result.message}
            </p>
          </div>
        )}
      </div>
    </Field>
  );
}
