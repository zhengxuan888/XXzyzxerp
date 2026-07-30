"use client";

import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

type Row = {
  row: number; username: string; fullName: string; email: string;
  departmentCode: string; roleCode: string; managerUsername: string;
  action: "CREATE" | "REJECT"; errors: string[];
};

export default function EmployeeImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(mode: "preview" | "commit") {
    if (!file) return;
    setLoading(true);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    const response = await fetch("/api/admin/users/import", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setRows(payload?.error?.details?.rows ?? rows);
      setMessage(payload?.error?.message ?? "导入失败。");
      return;
    }
    if (mode === "preview") {
      setRows(payload.data.rows);
      setMessage(`识别 ${payload.data.summary.total} 行：可建立 ${payload.data.summary.create}，错误/越权 ${payload.data.summary.reject}。`);
    } else {
      setMessage(`已建立 ${payload.data.imported} 个待激活员工账号；未导入任何密码。`);
      window.setTimeout(() => window.location.reload(), 900);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-700"><FileSpreadsheet size={18} /><strong>安全导入员工</strong></div>
          <p className="mt-1 text-sm text-slate-500">
            支持 XLSX/CSV；校验部门、角色、上级和转授权范围。账号默认停用，不导入密码、Token 或 Session。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            选择文件
            <input className="sr-only" type="file" accept=".xlsx,.csv" onChange={(event) => {
              setFile(event.target.files?.[0] ?? null); setRows([]); setMessage("");
            }} />
          </label>
          <button disabled={!file || loading} onClick={() => submit("preview")} className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 disabled:opacity-40">
            {loading ? <LoaderCircle className="inline animate-spin" size={16} /> : "验证并预览"}
          </button>
          <button disabled={!rows.length || rows.some((row) => row.action === "REJECT") || loading} onClick={() => submit("commit")} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-40">
            <Upload className="mr-1 inline" size={16} />建立待激活账号
          </button>
        </div>
      </div>
      {file && <p className="mt-3 text-sm text-slate-600">当前文件：{file.name}</p>}
      {message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">{message}</p>}
      {!!rows.length && (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr><th className="p-3">行</th><th>账号</th><th>姓名</th><th>邮箱</th><th>部门</th><th>角色</th><th>直属上级</th><th>结果</th></tr>
            </thead>
            <tbody>{rows.map((row) => (
              <tr key={row.row} className="border-t border-slate-100">
                <td className="p-3">{row.row}</td><td>{row.username}</td><td>{row.fullName}</td><td>{row.email}</td>
                <td>{row.departmentCode}</td><td>{row.roleCode}</td><td>{row.managerUsername || "-"}</td>
                <td className={row.action === "CREATE" ? "text-emerald-700" : "text-red-700"}>
                  {row.action === "CREATE" ? "可建立（默认停用）" : row.errors.join("；")}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
