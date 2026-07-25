"use client";

import { useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

type PreviewRow = {
  rowNumber: number;
  orderNo: string;
  trackingNo: string;
  carrier: string;
  employee: string | null;
  result: "READY" | "WARNING" | "REJECTED";
  message: string;
};

function splitAliases(raw: string) {
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function LogisticsReturnImport() {
  const [file, setFile] = useState<File | null>(null);
  const [orderNoHeader, setOrderNoHeader] = useState("orderNo,orderNo,订单号");
  const [trackingNoHeader, setTrackingNoHeader] = useState("trackingNo,trackingNo,物流单号");
  const [carrierHeader, setCarrierHeader] = useState("carrier,carrier,承运商");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(commit: boolean) {
    if (!file) return;
    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.set("file", file);
    form.set("commit", String(commit));
    form.set(
      "aliases",
      JSON.stringify({
        orderNo: splitAliases(orderNoHeader),
        trackingNo: splitAliases(trackingNoHeader),
        carrier: splitAliases(carrierHeader),
      }),
    );

    const response = await fetch("/api/mvp/shipments/return-import", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "导入失败");
      return;
    }
    setRows(payload.data.rows);
    if (commit) {
      setMessage(`导入完成：共 ${payload.data.summary.imported} 条回填成功。`);
      window.setTimeout(() => window.location.reload(), 1000);
    } else {
      const summary = payload.data.summary;
      setMessage(`预览完成：可导入 ${summary.ready} 条，提醒 ${summary.warning} 条，拒绝 ${summary.rejected} 条。`);
    }
  }

  const readyCount = rows.filter((row) => row.result === "READY").length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-700">
            <FileSpreadsheet size={18} />
            <strong>物流回传单号</strong>
          </div>
          <p className="mt-1 text-sm text-slate-500">上传物流返回的表格进行单号回填。支持自定义列名映射（逗号分隔）。</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
          <label className="text-xs">
            <span className="text-slate-600">订单号列名</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              value={orderNoHeader}
              onChange={(event) => setOrderNoHeader(event.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="text-slate-600">物流单号列名</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              value={trackingNoHeader}
              onChange={(event) => setTrackingNoHeader(event.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="text-slate-600">承运商列名（可选）</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              value={carrierHeader}
              onChange={(event) => setCarrierHeader(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            选择 XLSX
            <input
              className="sr-only"
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            disabled={!file || loading}
            onClick={() => submit(false)}
            className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 disabled:opacity-40"
          >
            {loading ? <LoaderCircle className="inline animate-spin" size={16} /> : "预览回填"}
          </button>
          <button
            disabled={!rows.length || !readyCount || loading}
            onClick={() => submit(true)}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Upload className="mr-1 inline" size={16} />确认导入 {readyCount || ""}
          </button>
        </div>
      </div>

      {file && <p className="mt-3 text-sm text-slate-600">当前文件：{file.name}</p>}
      {message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>}

      {rows.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">行号</th>
                <th>订单号</th>
                <th>制单人</th>
                <th>物流单号</th>
                <th>承运商</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-slate-100">
                  <td className="p-3">{row.rowNumber}</td>
                  <td>{row.orderNo || "-"}</td>
                  <td>{row.employee || "-"}</td>
                  <td className="font-mono">{row.trackingNo || "-"}</td>
                  <td>{row.carrier || "-"}</td>
                  <td>
                    <span
                      className={
                        row.result === "READY"
                          ? "text-emerald-700"
                          : row.result === "WARNING"
                            ? "text-amber-700"
                            : "text-red-700"
                      }
                    >
                      {row.message}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
