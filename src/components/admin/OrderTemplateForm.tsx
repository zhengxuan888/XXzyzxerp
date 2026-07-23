"use client";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";

export default function OrderTemplateForm({ canManage }: { canManage: boolean }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      code: data.get("code"),
      name: data.get("name"),
      description: data.get("description"),
      isDefault: data.get("isDefault") === "on",
      configuration: {
        currency: data.get("currency"),
        logisticsChannel: data.get("logisticsChannel"),
        paymentMethod: data.get("paymentMethod"),
        defaultShippingFeeCents: Math.round(Number(data.get("shippingFee") || 0) * 100),
        defaultCodAmountCents: Math.round(Number(data.get("codAmount") || 0) * 100),
        requireCodAmount: data.get("requireCodAmount") === "on",
        requireRecipientPhone: data.get("requireRecipientPhone") === "on",
        requireRecipientEmail: data.get("requireRecipientEmail") === "on",
        requireRecipientAddress: data.get("requireRecipientAddress") === "on",
        requireSku: data.get("requireSku") === "on",
        requireRecipientCountryCode: data.get("requireRecipientCountryCode") === "on",
        requireRecipientPostalCode: data.get("requireRecipientPostalCode") === "on",
        requireRecipientRegion: data.get("requireRecipientRegion") === "on",
        requireRecipientCity: data.get("requireRecipientCity") === "on",
        requireProductName: data.get("requireProductName") === "on",
        requirePackageWeight: data.get("requirePackageWeight") === "on",
        customFields: String(data.get("customFields") || "").split("\n").flatMap((line) => {
          const [key, label, required] = line.split(",").map((part) => part.trim());
          return key && label ? [{ key, label, type: "text", required: required === "必填" }] : [];
        }),
      },
    };
    const response = await fetch("/api/mvp/order-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error?.message ?? result?.error ?? "保存失败");
      setSaving(false);
      return;
    }
    window.location.reload();
  }

  const input = "rounded-lg border border-gray-300 px-3 py-2";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-3">
      <label className="grid gap-1 text-sm">
        模板编码
        <input name="code" required placeholder="例如：GERMANY_COD" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        模板名称
        <input name="name" required placeholder="例如：德国 COD 订单" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认币种
        <input name="currency" required defaultValue="EUR" maxLength={3} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认物流渠道
        <input name="logisticsChannel" placeholder="例如：京东快递" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认运费
        <input name="shippingFee" type="number" min="0" step="0.01" defaultValue="0.00" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认 COD 金额
        <input name="codAmount" type="number" min="0" step="0.01" defaultValue="0.00" className={input} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-2">
        说明
        <input name="description" className={input} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-3">
        自定义字段（每行：字段标识, 显示名称, 必填）
        <textarea
          name="customFields"
          rows={3}
          className={input}
          placeholder={"store_id,店铺ID,必填\nsales_channel,销售渠道"}
        />
      </label>
      <div className="flex flex-wrap gap-4 text-sm md:col-span-3">
        <Check name="requireSku" label="SKU 必填" defaultChecked />
        <Check name="requireCodAmount" label="COD 金额必填" defaultChecked />
        <Check name="requireRecipientPhone" label="电话必填" defaultChecked />
        <Check name="requireRecipientEmail" label="邮箱必填" defaultChecked />
        <Check name="requireRecipientAddress" label="地址必填" defaultChecked />
        <Check name="requireRecipientCountryCode" label="国家代码必填" />
        <Check name="requireRecipientPostalCode" label="邮编必填" />
        <Check name="requireRecipientRegion" label="州/区域必填" />
        <Check name="requireRecipientCity" label="城市必填" />
        <Check name="requireProductName" label="商品名称必填" defaultChecked />
        <Check name="requirePackageWeight" label="包裹重量必填" />
        <Check name="isDefault" label="设为默认模板" />
      </div>
      {error && <p className="text-sm text-red-600 md:col-span-3">{error}</p>}
      <div className="md:col-span-3">
        <button disabled={!canManage || saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-white disabled:opacity-50">
          <Save size={16} />
          {saving ? "保存中..." : "保存模板"}
        </button>
      </div>
    </form>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
