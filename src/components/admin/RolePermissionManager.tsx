"use client";

import { Check, ChevronDown, ChevronRight, LoaderCircle, Pencil, Plus, Search, Settings2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { actionLabel, permissionModule } from "@/lib/permission-display";

type Scope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "DEPARTMENT_TREE" | "SUBORDINATES" | "SITE" | "SELF";
type ActionOption = { key: string; name: string; namespace: string; defaultScope: Scope };
type RoleItem = { id: string; code: string; name: string; description: string | null; isSystem: boolean; permissions: Array<{ actionKey: string; scope: string }> };

const scopes: Array<{ value: Scope; label: string }> = [
  { value: "SELF", label: "仅本人" },
  { value: "SUBORDINATES", label: "本人及下属" },
  { value: "SITE", label: "所属站点" },
  { value: "DEPARTMENT", label: "本部门" },
  { value: "DEPARTMENT_TREE", label: "本部门及下级部门" },
  { value: "BUSINESS_UNIT", label: "当前业务板块" },
  { value: "ALL", label: "全部业务板块" },
];

export default function RolePermissionManager({ roles, actions, canCreate, canUpdate }: { roles: RoleItem[]; actions: ActionOption[]; canCreate: boolean; canUpdate: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(payload: { code: string; name: string; description: string | null; permissions: Array<{ actionKey: string; scope: string }> }, roleId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(roleId ? `/api/admin/roles/${roleId}` : "/api/admin/roles", {
        method: roleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleId ? payload : { ...payload, actionKeys: payload.permissions.map((item) => item.actionKey) }),
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
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200/80 p-5">
          <div><h2 className="text-lg font-bold text-slate-950">角色权限</h2><p className="mt-1 text-sm text-slate-500">选择角色，点击权限项即可开启或关闭。</p></div>
          {canCreate && <button type="button" onClick={() => { setCreating((value) => !value); setEditingId(null); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"><Plus size={16} />新增角色</button>}
        </header>
        {error && <p className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</p>}
        {creating && <RoleForm actions={actions} busy={busy} onSave={(payload) => save(payload)} onCancel={() => setCreating(false)} />}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const isEditing = editingId === role.id;
          return (
            <article key={role.id} className={`overflow-hidden rounded-2xl border bg-white/90 shadow-sm transition ${isEditing ? "border-amber-300 ring-2 ring-amber-100 md:col-span-2 xl:col-span-3" : "border-slate-200/80 hover:-translate-y-0.5 hover:shadow-md"}`}>
              <button type="button" onClick={() => canUpdate && setEditingId(isEditing ? null : role.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-bold text-slate-950">{role.name}</h3><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{role.permissions.length} 项</span></div><p className="mt-1 truncate text-sm text-slate-500">{role.description || "暂无说明"}</p></div>
                {canUpdate && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Pencil size={14} />{isEditing ? "收起" : "配置"}</span>}
              </button>
              {isEditing && <RoleForm role={role} actions={actions} busy={busy} onSave={(payload) => save(payload, role.id)} onCancel={() => setEditingId(null)} />}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function RoleForm({ role, actions, busy, onSave, onCancel }: { role?: RoleItem; actions: ActionOption[]; busy: boolean; onSave: (payload: { code: string; name: string; description: string | null; permissions: Array<{ actionKey: string; scope: string }> }) => void; onCancel: () => void }) {
  const initial = useMemo(() => new Map(role?.permissions.map((item) => [item.actionKey, item.scope as Scope]) ?? []), [role]);
  const [enabled, setEnabled] = useState(() => new Set(initial.keys()));
  const [scopeByKey, setScopeByKey] = useState<Record<string, Scope>>(() => Object.fromEntries(actions.map((action) => [action.key, initial.get(action.key) ?? action.defaultScope])));
  const [query, setQuery] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [expandedScope, setExpandedScope] = useState<string | null>(null);
  const [openModules, setOpenModules] = useState(() => new Set(["订单管理", "发货与售后"]));

  const modules = useMemo(() => {
    const grouped = new Map<string, ActionOption[]>();
    for (const action of actions) {
      const moduleName = permissionModule(action.key);
      grouped.set(moduleName, [...(grouped.get(moduleName) ?? []), action]);
    }
    return [...grouped.entries()];
  }, [actions]);

  function toggle(key: string) {
    setEnabled((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  function setModule(moduleActions: ActionOption[], value: boolean) {
    setEnabled((current) => { const next = new Set(current); for (const action of moduleActions) { if (value) next.add(action.key); else next.delete(action.key); } return next; });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      permissions: actions.filter((action) => enabled.has(action.key)).map((action) => ({ actionKey: action.key, scope: scopeByKey[action.key] ?? action.defaultScope })),
    });
  }

  const input = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <form onSubmit={submit} className="border-t border-slate-200 bg-slate-50/70 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">角色编码<input name="code" required readOnly={role?.isSystem} defaultValue={role?.code} className={input} /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">角色名称<input name="name" required defaultValue={role?.name} className={input} /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">说明<input name="description" defaultValue={role?.description ?? ""} className={input} /></label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索权限，例如：导出订单" className="h-10 w-full rounded-lg bg-slate-100 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-amber-100" /></label>
        <div className="flex items-center gap-3"><span className="text-sm text-slate-500">已开启 <strong className="text-amber-700">{enabled.size}</strong> / {actions.length}</span><button type="button" onClick={() => setShowTechnical((value) => !value)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600"><Settings2 size={14} />{showTechnical ? "隐藏技术标识" : "显示技术标识"}</button></div>
      </div>

      <div className="mt-3 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
        {modules.map(([module, moduleActions]) => {
          const visibleActions = moduleActions.filter((action) => !normalizedQuery || actionLabel(action.key).toLowerCase().includes(normalizedQuery) || action.key.toLowerCase().includes(normalizedQuery));
          if (!visibleActions.length) return null;
          const enabledCount = moduleActions.filter((action) => enabled.has(action.key)).length;
          const open = normalizedQuery ? true : openModules.has(module);
          return (
            <section key={module} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-amber-50/70 to-white px-4 py-3">
                <button type="button" onClick={() => setOpenModules((current) => { const next = new Set(current); if (next.has(module)) next.delete(module); else next.add(module); return next; })} className="flex flex-1 items-center gap-2 text-left"><span className="text-slate-400">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span><strong className="text-sm text-slate-900">{module}</strong><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">{enabledCount}/{moduleActions.length}</span></button>
                <button type="button" onClick={() => setModule(moduleActions, enabledCount !== moduleActions.length)} className="text-xs font-semibold text-amber-700 hover:text-amber-800">{enabledCount === moduleActions.length ? "全部关闭" : "全部开启"}</button>
              </div>
              {open && <div className="grid gap-2 border-t border-slate-100 p-3 lg:grid-cols-2 2xl:grid-cols-3">
                {visibleActions.map((action) => {
                  const isEnabled = enabled.has(action.key);
                  const scopeOpen = expandedScope === action.key;
                  return <div key={action.key} className={`overflow-hidden rounded-xl border transition ${isEnabled ? "border-amber-300 bg-amber-50/55 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <button type="button" onClick={() => toggle(action.key)} aria-pressed={isEnabled} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0"><strong className={`block text-sm ${isEnabled ? "text-amber-900" : "text-slate-700"}`}>{actionLabel(action.key)}</strong>{showTechnical && <span className="mt-0.5 block break-all text-[11px] text-slate-400">{action.key}</span>}</span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${isEnabled ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 bg-slate-50 text-transparent"}`}><Check size={15} strokeWidth={3} /></span>
                    </button>
                    {isEnabled && <div className="border-t border-amber-200/70 px-3 py-2"><button type="button" onClick={() => setExpandedScope(scopeOpen ? null : action.key)} className="flex w-full items-center justify-between text-xs text-slate-500"><span>数据范围：<strong className="text-slate-700">{scopes.find((scope) => scope.value === scopeByKey[action.key])?.label}</strong></span>{scopeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>{scopeOpen && <select aria-label={`${actionLabel(action.key)}的数据范围`} value={scopeByKey[action.key]} onChange={(event) => setScopeByKey((current) => ({ ...current, [action.key]: event.target.value as Scope }))} className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs">{scopes.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}</select>}</div>}
                  </div>;
                })}
              </div>}
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-4 flex items-center justify-between border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><span className="text-xs text-slate-500">修改保存后立即生效</span><div className="flex gap-2"><button type="button" onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">取消</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50">{busy && <LoaderCircle size={15} className="animate-spin" />}保存权限</button></div></div>
    </form>
  );
}
