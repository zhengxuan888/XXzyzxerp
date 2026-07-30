"use client";

import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

type Row = {
  row: number;
  orderNo: string;
  category: string;
  amountCents: number;
  amountText: string;
  currency: string;
  paidAt: string;
  action: "CREATE" | "SKIP" | "REJECT";
  errors: string[];
};

export default function ExpenseImportPanel() {
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
    const response = await fetch("/api/mvp/expenses/import", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setRows(payload?.error?.details?.rows ?? rows);
      setMessage(payload?.error?.message ?? "导入失败。");
      return;
    }
    if (mode === "preview") {
      setRows(payload.data.rows);
      const summary = payload.data.summary;
      setMessage(`识别 ${summary.total} 行：新增 ${summary.create}，跳过 ${summary.skip}，错误 ${summary.reject}。`);
    } else {
      setMessage(`导入完成：新增 ${payload.data.imported} 条费用，跳过 ${payload.data.skipped} 条重复记录。`);
      window.setTimeout(() => window.location.reload(), 900);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-700">
            <FileSpreadsheet size={18} /><strong>智能导入费用/支出</strong>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            支持 XLSX/CSV；金额按最小货币单位精确转换，先检查订单、币种、日期和重复记录。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            选择文件
            <input className="sr-only" type="file" accept=".xlsx,.csv" onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setRows([]);
              setMessage("");
            }} />
          </label>
          <button disabled={!file || loading} onClick={() => submit("preview")} className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 disabled:opacity-40">
            {loading ? <LoaderCircle className="inline animate-spin" size={16} /> : "识别并预览"}
          </button>
          <button disabled={!rows.length || rows.some((row) => row.action === "REJECT") || loading} onClick={() => submit("commit")} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-40">
            <Upload className="mr-1 inline" size={16} />确认导入
          </button>
        </div>
      </div>
      {file && <p className="mt-3 text-sm text-slate-600">当前文件：{file.name}</p>}
      {message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">{message}</p>}
      {!!rows.length && (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr><th className="p-3">行</th><th>订单号</th><th>类别</th><th>金额</th><th>币种</th><th>付款日期</th><th>结果</th></tr>
            </thead>
            <tbody>{rows.map((row) => (
              <tr key={row.row} className="border-t border-slate-100">
                <td className="p-3">{row.row}</td><td>{row.orderNo || "-"}</td><td>{row.category || "-"}</td>
                <td>{row.amountText || "-"}</td><td>{row.currency}</td><td>{row.paidAt || "-"}</td>
                <td className={row.action === "CREATE" ? "text-emerald-700" : row.action === "SKIP" ? "text-amber-700" : "text-red-700"}>
                  {row.action === "CREATE" ? "可新增" : row.action === "SKIP" ? "疑似重复，跳过" : row.errors.join("；")}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
