"use client";

import { Save, Settings2 } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import type {
  DashboardCardAudience,
  DashboardWorkbenchCard,
  DashboardWorkbenchConfig,
} from "@/lib/dashboard-workbench-config";

type SelectOption = { id: string; name: string };

type DashboardWorkbenchSettingsProps = {
  initial: DashboardWorkbenchConfig;
  roles: SelectOption[];
  departments: SelectOption[];
  memberships: SelectOption[];
};

function readSelectedValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions, (option) => option.value);
}

export default function DashboardWorkbenchSettings({
  initial,
  roles,
  departments,
  memberships,
}: DashboardWorkbenchSettingsProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateCard(index: number, update: Partial<DashboardWorkbenchCard>) {
    setConfig((current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...update } : card),
    }));
  }

  function updateAudience(index: number, key: keyof DashboardCardAudience, values: string[]) {
    const card = config.cards[index];
    if (!card) return;
    updateCard(index, { audience: { ...card.audience, [key]: values } });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/mvp/dashboard-workbench-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "保存失败，请检查配置后重试。");
        return;
      }
      setMessage("工作台卡片已保存，正在刷新权限范围内的统计。");
      window.setTimeout(() => window.location.reload(), 450);
    } catch {
      setMessage("网络连接失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-amber-100 text-amber-800"><Settings2 size={18} /></span>
          <span><strong className="block text-sm text-slate-900">配置我的工作台</strong><small className="mt-0.5 block text-xs text-slate-500">调整卡片显示、排序、区域，以及适用角色、部门或员工。</small></span>
        </span>
        <span className="text-xs font-semibold text-amber-800">{open ? "收起配置" : "打开配置"}</span>
      </button>

      {open && <div className="space-y-4 border-t border-amber-100 p-5">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">卡片只决定入口与展示，不增加任何数据权限；实际数字与跳转页面仍会在服务端按当前 Membership、Action、Scope 和临时授权过滤。</p>
        <div className="space-y-3">
          {config.cards.map((card, index) => (
            <article key={card.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <code className="text-xs font-semibold text-amber-800">{card.key}</code>
                  <p className="mt-1 text-xs text-slate-500">选择适用范围后，未匹配的角色/部门/员工不会看到此卡片。</p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={card.isVisible} onChange={(event) => updateCard(index, { isVisible: event.target.checked })} />显示此卡片</label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>卡片标题</span><input value={card.label} maxLength={60} onChange={(event) => updateCard(index, { label: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示区域</span><select value={card.zone} onChange={(event) => updateCard(index, { zone: event.target.value === "OVERVIEW" ? "OVERVIEW" : "CORE" })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"><option value="CORE">核心工作</option><option value="OVERVIEW">业务概览</option></select></label>
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序（数字越小越靠前）</span><input type="number" min={0} max={10000} value={card.sortOrder} onChange={(event) => updateCard(index, { sortOrder: Number(event.target.value) })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>说明</span><input value={card.description} maxLength={180} onChange={(event) => updateCard(index, { description: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>适用角色（留空=不限）</span><select multiple value={card.audience.roleIds} onChange={(event) => updateAudience(index, "roleIds", readSelectedValues(event))} className="min-h-24 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">{roles.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>适用部门（留空=不限）</span><select multiple value={card.audience.departmentIds} onChange={(event) => updateAudience(index, "departmentIds", readSelectedValues(event))} className="min-h-24 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">{departments.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-medium text-slate-600"><span>适用员工（留空=不限）</span><select multiple value={card.audience.membershipIds} onChange={(event) => updateAudience(index, "membershipIds", readSelectedValues(event))} className="min-h-24 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">{memberships.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              </div>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white shadow-sm shadow-amber-200 hover:bg-amber-800 disabled:opacity-50"><Save size={16} />{saving ? "保存中…" : "保存工作台配置"}</button>
          {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
        </div>
      </div>}
    </section>
  );
}
