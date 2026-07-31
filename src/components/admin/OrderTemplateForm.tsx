"use client";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";
import type { OrderTemplateConfiguration } from "@/lib/order-template";

type InitialTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  configuration: OrderTemplateConfiguration;
};

export default function OrderTemplateForm({ canManage, initial }: { canManage: boolean; initial?: InitialTemplate }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") || "").trim();
    const name = String(data.get("name") || "").trim();
    if (!code) { setError("请填写模板编码。"); return; }
    if (!/^[\p{L}\p{N}_-]{2,40}$/u.test(code)) { setError("模板编码需为 2–40 个中英文字母、数字、下划线或短横线，不能包含空格。"); return; }
    if (!name) { setError("请填写模板名称。"); return; }
    setSaving(true);
    const payload = {
      code,
      name,
      description: data.get("description"),
      isDefault: data.get("isDefault") === "on",
      isActive: data.get("isActive") === "on",
      configuration: {
        currency: data.get("currency"),
        logisticsChannel: data.get("logisticsChannel"),
        paymentMethod: data.get("paymentMethod"),
        defaultShippingFeeCents: Math.round(Number(data.get("shippingFee") || 0) * 100),
        defaultCodAmountCents: Math.round(Number(data.get("codAmount") || 0) * 100),
        requireCodAmount: data.get("requireCodAmount") === "on",
        requireShopId: data.get("requireShopId") === "on",
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
        reviewRejectReasons: String(data.get("reviewRejectReasons") || "").split("\n").map((item) => item.trim()).filter(Boolean),
        voidReasons: String(data.get("voidReasons") || "").split("\n").map((item) => item.trim()).filter(Boolean),
        customFields: String(data.get("customFields") || "").split("\n").flatMap((line) => {
          const [key, label, required] = line.split(",").map((part) => part.trim());
          return key && label ? [{ key, label, type: "text", required: required === "必填" }] : [];
        }),
      },
    };
    const response = await fetch(initial ? `/api/mvp/order-templates/${initial.id}` : "/api/mvp/order-templates", {
      method: initial ? "PATCH" : "POST",
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
        <input name="code" required maxLength={40} defaultValue={initial?.code} placeholder="例如：通用_COD 或 GERMANY_COD" className={input} />
        <span className="text-xs text-gray-500">支持中文、英文、数字、下划线和短横线，不允许空格。</span>
      </label>
      <label className="grid gap-1 text-sm">
        模板名称
        <input name="name" required maxLength={80} defaultValue={initial?.name} placeholder="例如：德国 COD 订单" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认币种
        <input name="currency" required defaultValue={initial?.configuration.currency ?? "EUR"} maxLength={3} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认物流渠道
        <input name="logisticsChannel" defaultValue={initial?.configuration.logisticsChannel} placeholder="例如：京东快递" className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认运费
        <input name="shippingFee" type="number" min="0" step="0.01" defaultValue={((initial?.configuration.defaultShippingFeeCents ?? 0) / 100).toFixed(2)} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        默认 COD 金额
        <input name="codAmount" type="number" min="0" step="0.01" defaultValue={((initial?.configuration.defaultCodAmountCents ?? 0) / 100).toFixed(2)} className={input} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-2">
        说明
        <input name="description" defaultValue={initial?.description ?? ""} className={input} />
      </label>
      <label className="grid gap-1 text-sm md:col-span-3">
        自定义字段（每行：字段标识, 显示名称, 必填）
        <textarea
          name="customFields"
          rows={3}
          className={input}
          defaultValue={initial?.configuration.customFields.map((field) => `${field.key},${field.label}${field.required ? ",必填" : ""}`).join("\n")}
          placeholder={"store_id,店铺ID,必填\nsales_channel,销售渠道"}
        />
      </label>
      <label className="grid gap-1 text-sm md:col-span-2">
        核单退回快捷原因（每行一个，可在核单时继续补充）
        <textarea
          name="reviewRejectReasons"
          rows={5}
          className={input}
          defaultValue={initial?.configuration.reviewRejectReasons.join("\n") ?? "客户信息不完整\n地址或邮编有误\n商品或数量需确认\nCOD 金额有误\n沟通凭证不完整\n疑似重复订单"}
        />
      </label>
      <label className="grid gap-1 text-sm">
        作废快捷原因（每行一个）
        <textarea
          name="voidReasons"
          rows={5}
          className={input}
          defaultValue={initial?.configuration.voidReasons.join("\n") ?? "客户明确取消\n重复订单\n测试或无效订单\n无法联系客户\n不符合发货条件"}
        />
      </label>
      <div className="flex flex-wrap gap-4 text-sm md:col-span-3">
        <Check name="requireSku" label="SKU 必填" defaultChecked={initial?.configuration.requireSku ?? true} />
        <Check name="requireCodAmount" label="COD 金额必填" defaultChecked={initial?.configuration.requireCodAmount ?? true} />
        <Check name="requireShopId" label="店铺 ID 必填" defaultChecked={initial?.configuration.requireShopId} />
        <Check name="requireRecipientPhone" label="电话必填" defaultChecked={initial?.configuration.requireRecipientPhone ?? true} />
        <Check name="requireRecipientEmail" label="邮箱必填" defaultChecked={initial?.configuration.requireRecipientEmail ?? true} />
        <Check name="requireRecipientAddress" label="地址必填" defaultChecked={initial?.configuration.requireRecipientAddress ?? true} />
        <Check name="requireRecipientCountryCode" label="国家代码必填" defaultChecked={initial?.configuration.requireRecipientCountryCode} />
        <Check name="requireRecipientPostalCode" label="邮编必填" defaultChecked={initial?.configuration.requireRecipientPostalCode} />
        <Check name="requireRecipientRegion" label="州/区域必填" defaultChecked={initial?.configuration.requireRecipientRegion} />
        <Check name="requireRecipientCity" label="城市必填" defaultChecked={initial?.configuration.requireRecipientCity} />
        <Check name="requireProductName" label="商品名称必填" defaultChecked={initial?.configuration.requireProductName ?? true} />
        <Check name="requirePackageWeight" label="包裹重量必填" defaultChecked={initial?.configuration.requirePackageWeight} />
        <Check name="isDefault" label="设为默认模板" defaultChecked={initial?.isDefault} />
        <Check name="isActive" label="启用模板" defaultChecked={initial?.isActive ?? true} />
      </div>
      {error && <p className="text-sm text-red-600 md:col-span-3">{error}</p>}
      <div className="md:col-span-3">
        <button disabled={!canManage || saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-white disabled:opacity-50">
          <Save size={16} />
          {saving ? "保存中..." : initial ? "保存修改" : "保存模板"}
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
