"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type RoleOption = { id: string; name: string; description: string | null; permissions: string[] };
type MembershipItem = {
  id: string; roleId: string; businessUnitName: string; departmentName: string | null; siteName: string | null;
  scope: string; isPrimary: boolean; isActive: boolean; departmentId: string | null; siteId: string | null; managerMembershipId: string | null;
};

const scopeOptions = [
  ["SELF", "本人"], ["SITE", "站点"], ["DEPARTMENT", "本部门"],
  ["BUSINESS_UNIT", "业务板块"], ["ALL", "全部范围"],
];

export default function EmployeePermissionWorkspace({ userName, memberships, roles }: { userName: string; memberships: MembershipItem[]; roles: RoleOption[] }) {
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-950">{userName} · 权限配置</h1><p className="mt-1 text-sm text-slate-500">更换角色会同步更新该员工可见菜单和操作权限。</p></div><Link href="/admin/users" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">返回员工账号</Link></div>
    {memberships.map((membership) => <MembershipPermissionCard key={membership.id} membership={membership} roles={roles} />)}
  </div>;
}

function MembershipPermissionCard({ membership, roles }: { membership: MembershipItem; roles: RoleOption[] }) {
  const [roleId, setRoleId] = useState(membership.roleId);
  const [scope, setScope] = useState(membership.scope);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const role = roles.find((item) => item.id === roleId);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/memberships/${membership.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, scope, departmentId: membership.departmentId, siteId: membership.siteId, managerMembershipId: membership.managerMembershipId, isPrimary: membership.isPrimary, isActive: membership.isActive }) });
    const payload = await response.json().catch(() => null);
    setMessage(response.ok ? "权限已保存。" : payload?.error?.message ?? payload?.error ?? "保存失败。"); setBusy(false);
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck size={19} /></span><div><h2 className="font-bold text-slate-900">{membership.businessUnitName}</h2><p className="text-xs text-slate-500">{membership.departmentName ?? "未分配部门"} · {membership.siteName ?? "未分配站点"}</p></div></div>
    <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-[1fr_14rem_auto] md:items-end">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">岗位角色<select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 font-normal">{roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">数据范围<select value={scope} onChange={(event) => setScope(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 font-normal">{scopeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle className="animate-spin" size={16} />}保存权限</button>
    </form>
    {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm font-semibold text-slate-800">当前角色包含 {role?.permissions.length ?? 0} 项权限</p><p className="mt-1 text-xs text-slate-500">{role?.description || "暂无角色说明"}</p><div className="mt-3 flex flex-wrap gap-2">{role?.permissions.map((permission) => <span key={permission} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{permission}</span>)}</div></div>
    <div className="mt-4"><Link href="/admin/access-grants" className="text-sm font-semibold text-violet-700 hover:underline">配置临时额外权限 →</Link></div>
  </section>;
}
