import { CircleAlert, CircleCheck, FileText, MapPinned } from "lucide-react";

import OriginalAddressCapture from "@/components/admin/OriginalAddressCapture";
import {
  hasCustomerOriginalAddress,
  LEGACY_DERIVED_ADDRESS_SOURCE,
} from "@/lib/order-address";

type AddressComparisonProps = {
  recipientName: string | null;
  recipientPhone: string | null;
  recipientCountryCode: string | null;
  recipientRegion: string | null;
  recipientCity: string | null;
  recipientPostalCode: string | null;
  recipientAddress: string | null;
  recipientFullAddress: string | null;
  recipientFullAddressSource: string | null;
  orderId?: string;
  canCapture?: boolean;
  showOriginalAddress?: boolean;
  className?: string;
};

function hasValue(value: string | null) {
  return Boolean(value?.trim());
}

export default function AddressComparison({
  recipientName,
  recipientPhone,
  recipientCountryCode,
  recipientRegion,
  recipientCity,
  recipientPostalCode,
  recipientAddress,
  recipientFullAddress,
  recipientFullAddressSource,
  orderId,
  canCapture = false,
  showOriginalAddress = true,
  className = "",
}: AddressComparisonProps) {
  const structuredFields = [
    { label: "收件人", value: recipientName, required: true },
    { label: "电话", value: recipientPhone, required: true },
    { label: "国家/地区", value: recipientCountryCode, required: true },
    { label: "州/区域（可选）", value: recipientRegion, required: false },
    { label: "城市", value: recipientCity, required: true },
    { label: "邮编", value: recipientPostalCode, required: true },
    { label: "详细地址", value: recipientAddress, required: true, wide: true },
  ];
  const missingFields = structuredFields.filter((field) => field.required && !hasValue(field.value)).map((field) => field.label);
  const structuredComplete = missingFields.length === 0;
  const originalComplete = hasValue(recipientFullAddress)
    && hasCustomerOriginalAddress(recipientFullAddressSource);
  const legacyDerived = hasValue(recipientFullAddress)
    && recipientFullAddressSource === LEGACY_DERIVED_ADDRESS_SOURCE;

  return (
    <section
      aria-labelledby="address-comparison-heading"
      data-testid="address-comparison"
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="address-comparison-heading" className="font-bold text-slate-950">收货地址核对</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            核对员工拆分结果；完整原始地址仅供内部复核，不替代物流字段。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">逐项对照</span>
      </div>

      <div className={`mt-4 grid gap-4 ${showOriginalAddress ? "lg:grid-cols-2" : ""}`}>
        <article data-testid="structured-address-card" className="min-w-0 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700">
                <MapPinned size={16} aria-hidden="true" />
              </span>
              <div>
                <h4 className="font-semibold text-slate-950">员工拆分地址（发送物流）</h4>
                <p className="mt-0.5 text-xs text-slate-500">物流表按以下字段导出。</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${structuredComplete ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {structuredComplete ? <CircleCheck size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
              {structuredComplete ? "拆分字段完整" : `缺少 ${missingFields.join("、")}`}
            </span>
          </div>

          <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {structuredFields.map((field) => {
              const present = hasValue(field.value);
              return (
                <div key={field.label} className={field.wide ? "sm:col-span-2" : ""}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</dt>
                  <dd className={`mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 ${present ? "text-slate-900" : field.required ? "text-rose-700" : "text-slate-500"}`}>
                    {present ? field.value : field.required ? "未填写" : "未填写（不影响导出）"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </article>

        {showOriginalAddress && (
          <article data-testid="original-address-card" className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                  <FileText size={16} aria-hidden="true" />
                </span>
                <div>
                  <h4 className="font-semibold text-slate-950">客户完整原始地址（核对后删除）</h4>
                  <p className="mt-0.5 text-xs text-amber-800">仅供内部核对；发送物流商前删除表格中的原始地址列。</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${originalComplete ? "bg-emerald-100 text-emerald-700" : legacyDerived ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>
                {originalComplete ? <CircleCheck size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
                {originalComplete ? "客户原文已保留" : legacyDerived ? "历史拆分值，需补录" : "客户原文缺失"}
              </span>
            </div>
            <div className={`mt-4 min-h-28 rounded-lg border bg-white/80 p-3 ${originalComplete ? "border-amber-100" : legacyDerived ? "border-amber-300" : "border-rose-200"}`}>
              {originalComplete ? (
                <p className="whitespace-pre-wrap break-words text-sm font-medium leading-7 text-slate-900">
                  {recipientFullAddress}
                </p>
              ) : (
                <div>
                  {legacyDerived ? (
                    <div data-testid="legacy-derived-address-warning" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-semibold leading-6 text-amber-900">
                        此内容来自历史拆分地址，不是客户原文，不能用于物流核对。
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                        历史值：{recipientFullAddress}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium leading-6 text-rose-700">
                      未保留客户完整原始地址，请先补充后再核对。
                    </p>
                  )}
                  {orderId && canCapture ? (
                    <OriginalAddressCapture orderId={orderId} />
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">请联系有订单或物流维护权限的员工补录。</p>
                  )}
                </div>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
