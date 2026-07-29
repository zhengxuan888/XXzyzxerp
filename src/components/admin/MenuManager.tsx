"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

type MenuItem = {
  id: string;
  key: string;
  label: string;
  path: string;
  icon: string | null;
  parentId: string | null;
  parentLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiredActionKey: string | null;
};

type Option = { value: string; label: string };

export default function MenuManager({ menus, actionOptions, canCreate, canUpdate }: {
  menus: MenuItem[];
  actionOptions: Option[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      key: String(data.get("key") ?? "").trim(),
      label: String(data.get("label") ?? "").trim(),
      path: String(data.get("path") ?? "").trim(),
      icon: String(data.get("icon") ?? "").trim() || null,
      parentId: String(data.get("parentId") ?? "").trim() || null,
      requiredActionKey: String(data.get("requiredActionKey") ?? "").trim() || null,
      sortOrder: Number(data.get("sortOrder") ?? 0),
      isActive: data.get("isActive") === "on",
    };
    try {
      const response = await fetch(id ? `/api/admin/menus/${id}` : "/api/admin/menus", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? result?.error ?? "保存失败");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">菜单与主导航配置</h2>
            <p className="mt-1 text-xs text-slate-500">名称、层级、路由、排序和启停均由数据库配置，不写死在页面中。</p>
          </div>
          {canCreate && (
            <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">
              <Plus size={16} />新增菜单
            </button>
          )}
        </header>
        {error && <p className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</p>}
        {showCreate && <MenuForm menus={menus} actionOptions={actionOptions} busy={busy} onSubmit={(event) => save(event)} onCancel={() => setShowCreate(false)} />}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-4 py-3">名称</th><th className="px-4 py-3">分类</th><th className="px-4 py-3">路由</th><th className="px-4 py-3">权限动作</th><th className="px-4 py-3">排序</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {menus.map((menu) => (
                <tr key={menu.id} className="align-top">
                  <td className="px-4 py-3"><strong>{menu.label}</strong><small className="block text-slate-400">{menu.key}</small></td>
                  <td className="px-4 py-3 text-slate-600">{menu.parentLabel ?? "主导航"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{menu.path}</td>
                  <td className="px-4 py-3 text-slate-600">{menu.requiredActionKey ?? "无"}</td>
                  <td className="px-4 py-3">{menu.sortOrder}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${menu.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{menu.isActive ? "启用" : "停用"}</span></td>
                  <td className="px-4 py-3 text-right">
                    {canUpdate && <button type="button" onClick={() => setEditingId(editingId === menu.id ? null : menu.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Pencil size={14} />编辑</button>}
                  </td>
                </tr>
              ))}
              {!menus.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">暂无菜单配置</td></tr>}
            </tbody>
          </table>
        </div>
        {editingId && (() => {
          const item = menus.find((menu) => menu.id === editingId);
          return item ? <MenuForm menus={menus} actionOptions={actionOptions} initial={item} busy={busy} onSubmit={(event) => save(event, item.id)} onCancel={() => setEditingId(null)} /> : null;
        })()}
      </section>
    </div>
  );
}

function MenuForm({ menus, actionOptions, initial, busy, onSubmit, onCancel }: {
  menus: MenuItem[];
  actionOptions: Option[];
  initial?: MenuItem;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const input = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50/70 p-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">菜单编码<input className={input} name="key" required defaultValue={initial?.key} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">显示名称<input className={input} name="label" required defaultValue={initial?.label} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">页面路由<input className={input} name="path" required defaultValue={initial?.path} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">图标名称<input className={input} name="icon" defaultValue={initial?.icon ?? ""} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">上级分类<select className={input} name="parentId" defaultValue={initial?.parentId ?? ""}><option value="">主导航</option>{menus.filter((menu) => menu.id !== initial?.id).map((menu) => <option key={menu.id} value={menu.id}>{menu.label}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">所需权限动作<select className={input} name="requiredActionKey" defaultValue={initial?.requiredActionKey ?? ""}><option value="">无</option>{actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">显示顺序<input className={input} name="sortOrder" type="number" defaultValue={initial?.sortOrder ?? 0} /></label>
      <label className="flex items-center gap-2 pt-5 text-sm text-slate-700"><input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} />启用菜单</label>
      <div className="flex gap-2 md:col-span-2 xl:col-span-4">
        <button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy && <LoaderCircle size={15} className="animate-spin" />}保存
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm">取消</button>
      </div>
    </form>
  );
}
