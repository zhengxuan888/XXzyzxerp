"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type OriginalAddressCaptureProps = {
  orderId: string;
};

type ErrorPayload = {
  error?: {
    message?: string;
  };
};

export default function OriginalAddressCapture({ orderId }: OriginalAddressCaptureProps) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipientFullAddress = address.trim();
    if (!recipientFullAddress) {
      setMessage("请粘贴客户提供的完整原始地址。");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/mvp/orders/${encodeURIComponent(orderId)}/original-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientFullAddress }),
      });
      const payload = await response.json().catch(() => null) as ErrorPayload | null;
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "完整原始地址补录失败，请稍后重试。");
        return;
      }

      setMessage("补录成功，原始地址已锁定。正在刷新…");
      router.refresh();
    } catch {
      setMessage("网络异常，完整原始地址尚未保存。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-3" onSubmit={(event) => void capture(event)}>
      <label htmlFor={`original-address-${orderId}`} className="block text-xs font-semibold text-slate-700">
        一次性补录完整原始地址
      </label>
      <textarea
        id={`original-address-${orderId}`}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        required
        maxLength={1000}
        rows={4}
        autoComplete="street-address"
        placeholder="粘贴客户提供的完整原文；保存后不可修改或覆盖"
        className="mt-1.5 w-full resize-y rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">{address.length}/1000 · 请勿填写拆分后的地址</span>
        <button
          type="submit"
          disabled={saving || !address.trim()}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "保存中…" : "补录并锁定"}
        </button>
      </div>
      {message && <p role="status" aria-live="polite" className="mt-2 text-xs font-medium text-amber-800">{message}</p>}
    </form>
  );
}
