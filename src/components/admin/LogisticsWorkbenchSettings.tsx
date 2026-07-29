"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";

import type { LogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";

export default function LogisticsWorkbenchSettings({
  initial,
}: {
  initial: LogisticsWorkbenchConfig;
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/mvp/logistics-workbench-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "保存失败");
      return;
    }
    setMessage("配置已保存，正在刷新…");
    window.setTimeout(() => window.location.reload(), 500);
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><Settings2 size={16} />配置工作台卡片与快捷标签</button>
    {open && <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <label className="grid gap-1 text-sm"><span className="font-medium">快捷标签（每行一个）</span><textarea rows={6} value={config.quickTags.join("\n")} onChange={(event) => setConfig({ ...config, quickTags: event.target.value.split("\n") })} className="rounded-xl border border-slate-200 px-3 py-2" /></label>
      <div className="space-y-2"><p className="text-sm font-medium">统计卡片名称、显示和顺序</p>{config.cards.map((card, index) => <div key={card.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[8rem_1fr_6rem_5rem] sm:items-center"><code className="text-xs text-slate-500">{card.key}</code><input value={card.label} onChange={(event) => setConfig({ ...config, cards: config.cards.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" /><input type="number" value={card.sortOrder} onChange={(event) => setConfig({ ...config, cards: config.cards.map((item, itemIndex) => itemIndex === index ? { ...item, sortOrder: Number(event.target.value) } : item) })} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={card.isVisible} onChange={(event) => setConfig({ ...config, cards: config.cards.map((item, itemIndex) => itemIndex === index ? { ...item, isVisible: event.target.checked } : item) })} />显示</label></div>)}</div>
      <button type="button" disabled={saving} onClick={() => save()} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "保存中…" : "保存配置"}</button>
      {message && <span className="ml-3 text-sm text-slate-600">{message}</span>}
    </div>}
  </section>;
}
