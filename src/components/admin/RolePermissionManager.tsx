"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { actionLabel, namespaceLabel } from "@/lib/permission-display";

type Scope = "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "DEPARTMENT_TREE" | "SUBORDINATES" | "SITE" | "SELF";
type ActionOption = { key: string; name: string; namespace: string; defaultScope: Scope };
type RoleItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ actionKey: string; scope: string }>;
};

const scopes: Array<{ value: Scope; label: string }> = [
  { value: "SELF", label: "本人" },
  { value: "SUBORDINATES", label: "直属及下属" },
  { value: "SITE", label: "站点" },
  { value: "DEPARTMENT", label: "本部门" },
  { value: "DEPARTMENT_TREE", label: "本部门及下级部门" },
  { value: "BUSINESS_UNIT", label: "业务板块" },
  { value: "ALL", label: "全平台" },
];

export default function RolePermissionManager({ roles, actions, canCreate, canUpdate }: {
  roles: RoleItem[];
  actions: ActionOption[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, roleId?: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const permissions = actions.flatMap((action) =>
      data.get(`allowed:${action.key}`) === "on"
        ? [{ actionKey: action.key, scope: String(data.get(`scope:${action.key}`) ?? action.defaultScope) }]
        : [],
    );
    const payload = {
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      permissions,
    };
    try {
      const response = await fetch(roleId ? `/api/admin/roles/${roleId}` : "/api/admin/roles", {
        method: roleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleId ? payload : { ...payload, actionKeys: permissions.map((item) => item.actionKey) }),
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
          <div><h2 className="text-lg font-bold">角色与动作权限</h2><p className="mt-1 text-xs text-slate-500">角色名称不参与代码判断；动作、数据范围和菜单可见性由配置决定。</p></div>
          {canCreate && <button type="button" onClick={() => setCreating((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"><Plus size={16} />新增角色</button>}
        </header>
        {error && <p className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</p>}
        {creating && <RoleForm actions={actions} busy={busy} onSubmit={(event) => save(event)} onCancel={() => setCreating(false)} />}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold text-slate-950">{role.name}</h3><p className="text-xs text-slate-500">{role.code}{role.isSystem ? " · 系统角色" : ""}</p></div>
              {canUpdate && <button type="button" onClick={() => setEditingId(editingId === role.id ? null : role.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><Pencil size={14} />配置</button>}
            </div>
            <p className="mt-3 text-sm text-slate-600">{role.description || "暂无说明"}</p>
            <p className="mt-3 text-xs font-semibold text-violet-700">已开放 {role.permissions.length} 个动作</p>
            {editingId === role.id && <RoleForm role={role} actions={actions} busy={busy} onSubmit={(event) => save(event, role.id)} onCancel={() => setEditingId(null)} />}
          </article>
        ))}
      </section>
    </div>
  );
}

function RoleForm({ role, actions, busy, onSubmit, onCancel }: {
  role?: RoleItem;
  actions: ActionOption[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const permissionMap = useMemo(() => new Map(role?.permissions.map((item) => [item.actionKey, item.scope]) ?? []), [role]);
  const groups = useMemo(() => [...new Set(actions.map((action) => action.namespace))], [actions]);
  const input = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400";
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold">角色编码<input name="code" required readOnly={role?.isSystem} defaultValue={role?.code} className={input} /></label>
        <label className="grid gap-1 text-xs font-semibold">角色名称<input name="name" required defaultValue={role?.name} className={input} /></label>
        <label className="grid gap-1 text-xs font-semibold">说明<input name="description" defaultValue={role?.description ?? ""} className={input} /></label>
      </div>
      <div className="max-h-[34rem] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {groups.map((namespace) => (
          <fieldset key={namespace} className="rounded-xl border border-slate-200 bg-white p-3">
            <legend className="px-2 text-xs font-bold text-violet-700">{namespaceLabel(namespace)}</legend>
            <div className="grid gap-2 xl:grid-cols-2">
              {actions.filter((action) => action.namespace === namespace).map((action) => (
                <div key={action.key} className="grid grid-cols-[1fr_9rem] items-center gap-2 rounded-lg border border-slate-100 p-2">
                  <label className="flex min-w-0 items-start gap-2 text-xs"><input type="checkbox" name={`allowed:${action.key}`} defaultChecked={permissionMap.has(action.key)} /><span className="min-w-0"><strong className="block truncate">{actionLabel(action.key)}</strong></span></label>
                  <select name={`scope:${action.key}`} defaultValue={permissionMap.get(action.key) ?? action.defaultScope} className="h-8 rounded-lg border border-slate-200 px-2 text-xs">{scopes.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}</select>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex gap-2"><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle size={15} className="animate-spin" />}保存角色权限</button><button type="button" onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm">取消</button></div>
    </form>
  );
}
