"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, CircleCheck, CircleHelp, CircleX, FileImage, ImagePlus, LoaderCircle, MailCheck, MapPinCheck, Package, Search, Sparkles, Upload, WalletCards } from "lucide-react";
import type { OrderTemplateConfiguration } from "@/lib/order-template";
import AttachmentPanel from "@/components/admin/AttachmentPanel";
import { currencyForCountry } from "@/lib/order-country-currency";
import { declarationPreview } from "@/lib/order-declaration";

type Option = { id: string; code: string; name: string };
type ProductOption = Option & { skus: { id: string; code: string }[] };
type TemplateOption = Option & { configuration: OrderTemplateConfiguration; isDefault: boolean };
type AddressSuggestion = { countryCode: string; postalCode: string; region: string; city: string; address: string; formattedAddress: string };
type AddressValidation = { status: "verified" | "review"; label: string; suggestion: AddressSuggestion; issues: string[] };

const SKU_COLORS: Array<[string, string]> = [
  ["深蓝色", "#1e3a8a"], ["群青色", "#4338ca"], ["天蓝色", "#38bdf8"], ["蓝色", "#3b82f6"],
  ["粉色", "#ec4899"], ["绿色", "#22c55e"], ["黄色", "#eab308"], ["紫色", "#8b5cf6"],
  ["红色", "#ef4444"], ["橙色", "#f97316"], ["黑色", "#111827"], ["白色", "#ffffff"],
  ["灰色", "#94a3b8"], ["银色", "#cbd5e1"], ["金色", "#d4a72c"],
  ["原色钛金属", "#b7aa96"], ["黑色钛金属", "#343434"], ["白色钛金属", "#e7e5e4"], ["蓝色钛金属", "#64748b"],
];

function skuColor(name: string) {
  return SKU_COLORS.find(([label]) => name.includes(label))?.[1] ?? "#cbd5e1";
}

export default function OrderEntryForm({
  products,
  templates,
  countries,
  canCreate,
  canUploadOrderProof,
  canDeleteOrderProof,
  canSubmitForReview,
  canViewShipmentStatus,
  myOrderStats,
}: {
  products: ProductOption[];
  templates: TemplateOption[];
  countries: { code: string; name: string }[];
  canCreate: boolean;
  canUploadOrderProof: boolean;
  canDeleteOrderProof: boolean;
  canSubmitForReview: boolean;
  canViewShipmentStatus: boolean;
  myOrderStats: { total: number; draft: number; submitted: number; waiting_shipment: number; shipped: number; delivered: number; exception: number; completed: number; cancelled: number };
}) {
  const defaultTemplate = templates.find((item) => item.isDefault) ?? templates[0];
  const [templateId, setTemplateId] = useState(defaultTemplate?.id ?? "");
  const [selectedProductId, setSelectedProductId] = useState("");
  const selectedProduct = products.find((item) => item.id === selectedProductId);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [skuOpen, setSkuOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{ id: string; orderNo: string } | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [celebrationStats, setCelebrationStats] = useState<{ today: number; week: number; month: number } | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [smartAddress, setSmartAddress] = useState("");
  const [smartMessage, setSmartMessage] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrFileName, setOcrFileName] = useState("");
  const [pendingProofs, setPendingProofs] = useState<File[]>([]);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [recipientCountryCode, setRecipientCountryCode] = useState("");
  const [addressChecking, setAddressChecking] = useState(false);
  const [addressValidation, setAddressValidation] = useState<AddressValidation | null>(null);
  const [addressValidationMessage, setAddressValidationMessage] = useState("");
  const [codCurrency, setCodCurrency] = useState(defaultTemplate?.configuration.currency ?? "EUR");
  const [codAmount, setCodAmount] = useState(((defaultTemplate?.configuration.defaultCodAmountCents ?? 0) / 100).toFixed(2));
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
  const selectedSkuName = selectedProduct?.skus.find((sku) => sku.id === selectedSkuId)?.code ?? "";
  const finalProductName = selectedSkuName || selectedProductName;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const submittedData = new FormData(event.currentTarget);
    if (!String(submittedData.get("shopId") ?? "").trim()) {
      setError("请填写比特窗口号（店铺 ID）。");
      return;
    }
    if (config?.requireProductName !== false && !finalProductName) {
      setError("请填写商品名称。");
      return;
    }
    if (config?.requireSku && (!selectedProductId || !selectedSkuId)) {
      setError("当前订单模板要求选择关联库存商品和 SKU。");
      return;
    }
    if (canUploadOrderProof && pendingProofs.length === 0) {
      setError("请先添加客户沟通凭证，再确认订单。");
      return;
    }
    setSaving(true);
    setError("");
    const data = submittedData;
    const moneyToCents = (name: string) => Math.round(Number(data.get(name) || 0) * 100);
    const customFields = Object.fromEntries(
      (config?.customFields ?? []).map((field) => [field.key, data.get(`custom_${field.key}`) ?? ""]),
    );
    const payload = {
      orderTemplateId: templateId || undefined,
      customerName: String(data.get("recipientName") ?? ""),
      shopId: String(data.get("shopId") ?? ""),
      productId: selectedProductId,
      skuId: selectedSkuId,
      productName: finalProductName,
      quantity: Number(data.get("quantity") ?? 1),
      unitPriceCents: 0,
      codAmountCents: moneyToCents("codAmount"),
      shippingFeeCents: moneyToCents("shippingFee"),
      currency: currencyForCountry(String(data.get("recipientCountryCode") ?? ""), String(data.get("currency") ?? defaultValues.currency)),
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
    const order = { id: String(result.data.id), orderNo: String(result.data.orderNo) };
    const uploadErrors: string[] = [];
    for (const file of pendingProofs) {
      const proofForm = new FormData();
      proofForm.set("targetType", "ORDER");
      proofForm.set("targetId", order.id);
      proofForm.set("file", file);
      const proofResponse = await fetch("/api/mvp/attachments", { method: "POST", body: proofForm });
      const proofPayload = await proofResponse.json().catch(() => null);
      if (!proofResponse.ok) uploadErrors.push(`${file.name}：${proofPayload?.error?.message ?? "上传失败"}`);
    }
    setPendingProofs([]);
    setCreatedOrder(order);
    if (uploadErrors.length) setError(`订单已保存，但部分凭证上传失败：${uploadErrors.join("；")}`);
    setSaving(false);
  }

  async function submitForReview() {
    if (!createdOrder || submittingReview) return;
    setSubmittingReview(true);
    setError("");
    try {
      const response = await fetch(`/api/mvp/orders/${createdOrder.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.error ?? "提交核单失败");
      const statsResponse = await fetch("/api/mvp/orders/success-stats", { cache: "no-store" });
      if (statsResponse.ok) setCelebrationStats(await statsResponse.json());
      setCelebration(true);
      window.setTimeout(() => setCelebration(false), 10000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交核单失败");
    } finally {
      setSubmittingReview(false);
    }
  }

  const handleProductChange = (nextId: string) => {
    setSelectedProductId(nextId);
    setSelectedSkuId("");
  };

  const input =
    "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  function parseSmartAddress() {
    const lines = smartAddress.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const form = formRef.current;
    if (!form) return;
    const set = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    const email = lines.find((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line));
    const phone = lines.find((line) => /^[+()\d\s-]{7,}$/.test(line));
    const name = lines.find((line) => line !== email && line !== phone && !/[,.，。]/.test(line));
    const address = lines.filter((line) => line !== email && line !== phone && line !== name).join(", ");
    set("recipientName", name ?? lines[0] ?? "");
    set("recipientEmail", email ?? "");
    set("recipientPhone", phone ?? "");
    set("recipientAddress", address);
    setSmartMessage("已尝试填充收件人、邮箱、电话和地址，请人工核对后再提交。");
  }

  function formValue(name: string) {
    const field = formRef.current?.elements.namedItem(name);
    return field instanceof HTMLInputElement ? field.value.trim() : "";
  }

  function setFormValue(name: string, value: string) {
    const field = formRef.current?.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement)) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function validateAddress() {
    setAddressValidationMessage("");
    setAddressValidation(null);
    setAddressChecking(true);
    try {
      const response = await fetch("/api/mvp/address/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryCode: recipientCountryCode, postalCode: formValue("recipientPostalCode"), region: formValue("recipientRegion"), city: formValue("recipientCity"), address: formValue("recipientAddress") }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "地址验证失败");
      setAddressValidation(payload.data as AddressValidation);
    } catch (reason) {
      setAddressValidationMessage(reason instanceof Error ? reason.message : "地址验证失败，请稍后重试。");
    } finally {
      setAddressChecking(false);
    }
  }

  function applyAddressSuggestion() {
    if (!addressValidation) return;
    const suggestion = addressValidation.suggestion;
    if (suggestion.countryCode) { setRecipientCountryCode(suggestion.countryCode); setCodCurrency(currencyForCountry(suggestion.countryCode, defaultValues.currency)); }
    setFormValue("recipientPostalCode", suggestion.postalCode);
    setFormValue("recipientRegion", suggestion.region);
    setFormValue("recipientCity", suggestion.city);
    setFormValue("recipientAddress", suggestion.address || suggestion.formattedAddress);
    setAddressValidationMessage("已采用 Google 建议地址，请再核对一次。");
  }

  async function recognizeImage(file: File) {
    setSmartMessage("");
    if (![/^image\/jpeg$/, /^image\/png$/, /^image\/webp$/].some((pattern) => pattern.test(file.type))) {
      setSmartMessage("仅支持 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSmartMessage("图片不能超过 5MB。");
      return;
    }
    setOcrBusy(true);
    setOcrFileName(file.name || "粘贴的截图");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      const imageBase64 = dataUrl.split(",", 2)[1] || "";
      const response = await fetch("/api/mvp/vision/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "图片识别失败");
      setSmartAddress(String(payload?.data?.text || ""));
      setSmartMessage("图片文字已识别。请先检查识别结果，再点击“确认并填入”。");
    } catch (reason) {
      setSmartMessage(reason instanceof Error ? reason.message : "图片识别失败，请稍后重试。");
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="relative space-y-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-4 shadow-[var(--elevation-card)]">
      {celebration && <div className="fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-slate-950/35 p-4 backdrop-blur-sm" role="status">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(251,191,36,.35),transparent_20%),radial-gradient(circle_at_75%_20%,rgba(59,130,246,.28),transparent_18%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,.26),transparent_20%)] animate-pulse" />
        <div className="relative w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-100 text-3xl">🎉</div>
          <p className="mt-5 text-3xl font-bold text-slate-950">恭喜开单！</p>
          <p className="mt-2 text-sm text-slate-500">订单号：{createdOrder?.orderNo}</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-amber-50 p-4"><strong className="block text-2xl tabular-nums text-amber-800">{String(celebrationStats?.today ?? 1).padStart(2, "0")}</strong><span className="mt-1 block text-xs text-amber-700">今日第几单</span></div>
            <div className="rounded-2xl bg-blue-50 p-4"><strong className="block text-2xl tabular-nums text-blue-800">{celebrationStats?.week ?? "-"}</strong><span className="mt-1 block text-xs text-blue-700">本周累计</span></div>
            <div className="rounded-2xl bg-emerald-50 p-4"><strong className="block text-2xl tabular-nums text-emerald-800">{celebrationStats?.month ?? "-"}</strong><span className="mt-1 block text-xs text-emerald-700">本月累计</span></div>
          </div>
          <p className="mt-5 text-sm text-slate-500">订单已确认并提交核单，10 秒后进入下一笔录单。</p>
        </div>
      </div>}
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={<Package size={18} />} label="订单录入" value="新建订单" color="text-blue-600 bg-blue-50" />
        <Metric icon={<WalletCards size={18} />} label="预计收入" value="输入正确即可提交" color="text-emerald-600 bg-emerald-50" />
        <Metric icon={<CalendarDays size={18} />} label="录入日期" value={today} color="text-violet-600 bg-violet-50" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-xs sm:grid-cols-4 lg:grid-cols-8">
        {(canViewShipmentStatus
          ? [['我的订单', myOrderStats.total], ['审核中', myOrderStats.submitted], ['待发货', myOrderStats.waiting_shipment], ['运输中', myOrderStats.shipped], ['已签收', myOrderStats.delivered], ['异常', myOrderStats.exception], ['已完成', myOrderStats.completed], ['草稿', myOrderStats.draft]]
          : [['我的订单', myOrderStats.total], ['审核中', myOrderStats.submitted], ['待处理', myOrderStats.waiting_shipment], ['已完成', myOrderStats.shipped + myOrderStats.delivered + myOrderStats.exception + myOrderStats.completed], ['草稿', myOrderStats.draft]]
        ).map(([label, value]) => <div key={String(label)} className="bg-white px-3 py-2.5"><span className="block text-slate-500">{label}</span><strong className="mt-1 block text-lg tabular-nums text-slate-900">{value}</strong></div>)}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-500">
        <Search size={16} className="text-gray-400" />
        <span>电商订单按本次收件信息录入，无需选择固定客户</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/76 p-4">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <CircleHelp size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">录单时请一并添加客户沟通凭证</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">订单信息、收件信息、物流信息与客户沟通凭证均在当前板块填写，确认订单后自动保存和上传。</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Sparkles size={16} />
            订单模板
          </span>
          <select className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        <Section title="订单信息">
          <Field label="订单号">
            <input name="orderNo" readOnly value="保存后自动生成" className={`${input} bg-slate-50 text-slate-500`} aria-label="订单号（保存后自动生成）" />
          </Field>
          <Field label="比特窗口号（店铺 ID）" required><input name="shopId" required className={input} placeholder="请输入比特浏览器窗口号" /></Field>
          <Field label="搜索库存商品（可选）">
            <input
              className={input}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="需要关联库存/SKU 时再搜索"
            />
          </Field>
          <Field label="关联库存商品" required={config?.requireSku}>
            <select
              name="productId"
              required={config?.requireSku}
              className={input}
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
            >
              <option value="">手工商品（不扣库存）</option>
              {visibleProducts.map((item) => <option key={item.id} value={item.id}>{item.code} / {item.name}</option>)}
            </select>
          </Field>
          <Field label="SKU" required={config?.requireSku}>
            <div className="relative" onBlur={() => window.setTimeout(() => setSkuOpen(false), 100)}>
              <input type="hidden" name="skuId" value={selectedSkuId} />
              <button type="button" disabled={!selectedProductId} onClick={() => setSkuOpen((value) => !value)} className={`${input} flex items-center justify-between disabled:cursor-not-allowed disabled:bg-slate-50`}>
                <span className="flex min-w-0 items-center gap-2">
                  {selectedSkuName && <span className="size-4 shrink-0 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: skuColor(selectedSkuName) }} />}
                  <span className="truncate">{selectedSkuName || "选择 SKU"}</span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${skuOpen ? "rotate-180" : ""}`} />
              </button>
              {skuOpen && selectedProduct && <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {selectedProduct.skus.map((sku) => <button key={sku.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedSkuId(sku.id); setSkuOpen(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${selectedSkuId === sku.id ? "bg-amber-50 font-semibold text-amber-900" : "text-slate-800"}`}>
                  <span className="size-4 shrink-0 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: skuColor(sku.code) }} />
                  <span>{sku.code}</span>
                  {selectedSkuId === sku.id && <Check size={15} className="ml-auto text-amber-600" />}
                </button>)}
              </div>}
            </div>
          </Field>
          <Field label="数量" required><input name="quantity" type="number" min="1" defaultValue="1" required className={input} /></Field>
          <Field label="申报金额（EUR，自动）"><div><input name="unitPrice" readOnly value={declarationPreview(Number(codAmount || 0), codCurrency).toFixed(2)} className={`${input} bg-slate-50 font-semibold text-slate-700`} /><p className="mt-1 text-xs text-slate-400">COD 金额的 10%，按固定汇率换算</p></div></Field>
          <Field label="COD 币种"><input name="currency" readOnly value={codCurrency} className={`${input} bg-slate-50 font-semibold text-slate-700`} /></Field>
          <Field label="订单日期"><input name="orderedAt" type="date" defaultValue={today} className={input} /></Field>
        </Section>

        <Section title="收件信息">
          <div className="md:col-span-4 rounded-xl border border-blue-100 bg-blue-50/45 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-800"><Sparkles size={15} />智能识别地址（请仔细核对）</div>
            <input ref={ocrInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void recognizeImage(file); event.currentTarget.value = ""; }} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => ocrInputRef.current?.click()}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") ocrInputRef.current?.click(); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void recognizeImage(file); }}
              onPaste={(event) => { const file = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) { event.preventDefault(); void recognizeImage(file); } }}
              className="mb-3 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-300 bg-white px-4 py-3 text-center outline-none transition hover:border-blue-500 hover:bg-blue-50 focus:ring-2 focus:ring-blue-200"
            >
              {ocrBusy ? <LoaderCircle size={24} className="animate-spin text-blue-600" /> : <ImagePlus size={24} className="text-blue-600" />}
              <p className="mt-2 text-sm font-semibold text-slate-800">{ocrBusy ? "正在识别图片…" : "拖入图片、粘贴截图，或点击选择文件"}</p>
              <p className="mt-1 text-xs text-slate-500">JPG、PNG、WebP，最大 5MB；识别后不会自动提交订单</p>
              {ocrFileName && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"><FileImage size={13} />{ocrFileName}</span>}
            </div>
            <textarea value={smartAddress} onChange={(event) => setSmartAddress(event.target.value)} className="min-h-20 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100" placeholder="粘贴客户发来的姓名、电话、地址和邮箱，每行一项" />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={parseSmartAddress} disabled={!smartAddress.trim() || ocrBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Check size={14} />确认并填入</button>
              <button type="button" onClick={() => ocrInputRef.current?.click()} disabled={ocrBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Upload size={14} />选择图片</button>
              {smartMessage && <span className="text-xs text-emerald-700">{smartMessage}</span>}
            </div>
          </div>
          <div className="md:col-span-4">
            {!createdOrder ? (
              <PendingProofPicker files={pendingProofs} onChange={setPendingProofs} canUpload={canUploadOrderProof} />
            ) : (
              <AttachmentPanel
                targetType="ORDER"
                targetId={createdOrder.id}
                canUpload={canUploadOrderProof}
                canDelete={canDeleteOrderProof}
                title="客户沟通凭证（提交核单前必传）"
              />
            )}
          </div>
          <Field label="收件人" required><input name="recipientName" required className={input} placeholder="收件人姓名" /></Field>
          <Field label="电话" required={config?.requireRecipientPhone}>
            <input name="recipientPhone" required={config?.requireRecipientPhone} className={input} placeholder="收件人联系电话" />
          </Field>
          <EmailValidationField inputClass={input} required={config?.requireRecipientEmail !== false} />
          <Field label="国家代码" required={config?.requireRecipientCountryCode}>
            <select name="recipientCountryCode" required={config?.requireRecipientCountryCode} className={input} value={recipientCountryCode} onChange={(event) => { const country = event.target.value; setRecipientCountryCode(country); setCodCurrency(currencyForCountry(country, defaultValues.currency)); }}><option value="">请选择目的地国家</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select>
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
          <div className="md:col-span-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void validateAddress()} disabled={addressChecking || !recipientCountryCode} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{addressChecking ? <LoaderCircle size={16} className="animate-spin" /> : <MapPinCheck size={16} />}{addressChecking ? "正在检测…" : "检测地址"}</button>
              <span className="text-xs text-slate-500">用于核对邮编、城市和详细地址，不影响订单保存。</span>
              {addressValidationMessage && <span className="text-xs font-medium text-emerald-700">{addressValidationMessage}</span>}
            </div>
            {addressValidation && <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${addressValidation.status === "verified" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{addressValidation.label}</span>{addressValidation.issues.length > 0 && <span className="text-xs text-amber-700">{addressValidation.issues.join("；")}</span>}</div>
              <p className="mt-2 text-xs text-slate-500">Google 建议地址</p>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{addressValidation.suggestion.formattedAddress || [addressValidation.suggestion.address, addressValidation.suggestion.city, addressValidation.suggestion.region, addressValidation.suggestion.postalCode].filter(Boolean).join("，")}</p>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={applyAddressSuggestion} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">采用建议地址</button><button type="button" onClick={() => { setAddressValidation(null); setAddressValidationMessage("已保留原地址。"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">保留原地址</button></div>
            </div>}
          </div>
        </Section>

        <Section title="物流信息">
          <Field label={`COD 金额（${codCurrency}）`} required={config?.requireCodAmount}><input name="codAmount" type="number" min="0" step="0.01" value={codAmount} onChange={(event) => setCodAmount(event.target.value)} className={input} /></Field>
          <Field label={`运费（${codCurrency}）`}><input name="shippingFee" type="number" min="0" step="0.01" defaultValue={defaultValues.shippingFee} key={`${templateId}-shipping`} className={input} /></Field>
          <Field label="付款方式">
            <div className="flex h-10 items-center gap-4 rounded-xl border border-rose-100 bg-white px-3 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="paymentMethod" value="COD" defaultChecked={defaultValues.paymentMethod === "COD"} />到付</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="paymentMethod" value="PREPAID" defaultChecked={defaultValues.paymentMethod === "PREPAID"} />预付</label>
            </div>
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

      {createdOrder && (
        <div className="space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-emerald-900">订单已保存：{createdOrder.orderNo}</p>
              <p className="mt-1 text-xs text-emerald-800">客户沟通凭证已随订单上传，可直接预览确认并提交核单。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void submitForReview()}
            disabled={!canSubmitForReview || submittingReview}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={18} />
            {submittingReview ? "正在提交核单..." : "凭证确认无误，提交核单"}
          </button>
          {(!canUploadOrderProof || !canSubmitForReview) && <p className="text-xs text-amber-800">当前角色尚未配置订单凭证上传或提交核单权限，请由管理员在“角色权限”中开启对应动作。</p>}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!createdOrder && <div className="z-30 flex justify-end rounded-xl border border-white/90 bg-white/90 p-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur-xl md:fixed md:bottom-4 md:right-5">
        <button
          disabled={!canCreate || saving}
          className="flex min-w-40 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Check size={18} />
          {saving ? "正在保存..." : "确认订单"}
        </button>
      </div>}
    </form>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`rounded-xl p-2 ${color}`}>{icon}</span>
      <span><small className="block text-gray-500">{label}</small><strong className="text-lg">{value}</strong></span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-4">
      <legend className="col-span-full mb-1 pr-3 text-sm font-semibold text-slate-800">{title}</legend>
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

function PendingProofPicker({ files, onChange, canUpload }: { files: File[]; onChange: (files: File[]) => void; canUpload: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter((file) => {
      const limit = /^image\/(jpeg|png|webp)$/.test(file.type)
        ? 5 * 1024 * 1024
        : file.type === "application/pdf"
          ? 10 * 1024 * 1024
          : file.type === "video/mp4"
            ? 50 * 1024 * 1024
            : 0;
      return limit > 0 && file.size <= limit;
    });
    setPickerError(accepted.length === incoming.length ? "" : "部分文件格式不支持或超过大小限制，未加入凭证列表。");
    onChange([...files, ...accepted].slice(0, 10));
  };
  return <section className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/35 p-4" aria-label="客户沟通凭证">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-bold text-slate-950"><FileImage size={17} className="text-violet-600" />客户沟通凭证 <b className="text-rose-500">*</b></h2><p className="mt-1 text-xs text-slate-500">录单时一并添加，确认订单后自动上传，无需跳转页面。</p></div>
      {canUpload && <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"><Upload size={16} />选择文件</button>}
      <input ref={inputRef} type="file" multiple className="sr-only" accept=".png,.jpg,.jpeg,.webp,.pdf,.mp4,image/png,image/jpeg,image/webp,application/pdf,video/mp4" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
    </div>
    {canUpload ? <div tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} onPaste={(event) => { const pasted = Array.from(event.clipboardData.items).map((item) => item.kind === "file" ? item.getAsFile() : null).filter((file): file is File => Boolean(file)); if (pasted.length) { event.preventDefault(); addFiles(pasted); } }} className={`mt-3 cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm outline-none transition focus:ring-2 focus:ring-violet-200 ${dragging ? "border-violet-500 bg-violet-100 text-violet-900" : "border-violet-200 bg-white text-slate-500 hover:border-violet-400"}`}>{dragging ? "松开即可添加凭证" : "拖入文件 · Ctrl+V 粘贴截图 · 点击选择文件"}<p className="mt-1 text-xs text-slate-400">图片 5MB、PDF 10MB、MP4 50MB，最多 10 个文件</p></div> : <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">当前角色没有上传订单凭证权限，请联系管理员。</p>}
    {pickerError && <p className="mt-2 text-sm text-rose-600">{pickerError}</p>}
    {files.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2"><FileImage size={16} className="shrink-0 text-violet-600" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={file.name}>{file.name}</span><span className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)}KB</span><button type="button" onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))} className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" aria-label={`移除 ${file.name}`}><CircleX size={16} /></button></div>)}</div>}
  </section>;
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
