"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  employeeName: string;
  username: string;
  roleName: string;
  departmentName: string;
  managerMembershipId: string | null;
};

export default function ReportingLineManager({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const [values, setValues] = useState(Object.fromEntries(rows.map((row) => [row.id, row.managerMembershipId ?? ""])));
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  async function save(id: string) {
    setSavingId(id);
    setMessage("");
    const response = await fetch(`/api/admin/memberships/${id}/manager`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerMembershipId: values[id] || null }),
    });
    const result = await response.json().catch(() => null);
    setSavingId("");
    setMessage(response.ok ? "汇报关系已保存，统计、目标、考勤和订单范围立即按新层级生效。" : result?.error === "REPORTING_LINE_CYCLE" ? "不能形成循环汇报关系。" : "保存失败，请检查权限和人员范围。");
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-semibold text-amber-700">组织汇报线</p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">设置直属上级</h2>
        <p className="mt-1 text-xs text-slate-500">员工 → 经理 → 总监逐级递归；同级和其他业务板块默认不可见。</p>
      </div>
      {message && <div className="border-b border-slate-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">{message}</div>}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">员工</th><th className="px-4 py-3">岗位角色</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">直属上级</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-semibold">{row.employeeName}</p><p className="text-xs text-slate-400">{row.username}</p></td><td className="px-4 py-3">{row.roleName}</td><td className="px-4 py-3">{row.departmentName}</td><td className="px-4 py-3"><select disabled={!canManage} value={values[row.id] ?? ""} onChange={(event) => setValues({ ...values, [row.id]: event.target.value })} className="h-10 min-w-56 rounded-xl border border-slate-200 bg-white px-3"><option value="">无直属上级</option>{rows.filter((candidate) => candidate.id !== row.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.employeeName} · {candidate.roleName}</option>)}</select></td><td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="outline" disabled={!canManage || savingId === row.id} onClick={() => void save(row.id)}>{savingId === row.id ? "保存中…" : "保存"}</Button></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
