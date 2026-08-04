"use client";

import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";

type PreviewRow = {
  rowNumber: number;
  orderNo: string;
  trackingNo: string;
  carrier: string;
  employee: string | null;
  result: "READY" | "WARNING" | "REJECTED";
  message: string;
};

type ExportBatch = {
  id: string;
  batchNo: string;
  templateName: string;
  templateVersion: number;
  carrierName: string;
  status: "EXPORTED" | "SENT_TO_PROVIDER" | "RETURN_PREVIEWED" | "RETURN_IMPORTED" | "CANCELLED";
  createdAt: string;
  orderCount: number;
  exportArtifactId: string | null;
  latestReturnArtifactId: string | null;
  canPreview: boolean;
  canConfirm: boolean;
  canDispatch: boolean;
  canDownload: boolean;
};

function statusLabel(status: ExportBatch["status"]) {
  return {
    EXPORTED: "已导出，待发送",
    SENT_TO_PROVIDER: "已发给物流商",
    RETURN_PREVIEWED: "已回传预检",
    RETURN_IMPORTED: "回传已确认",
    CANCELLED: "已取消",
  }[status];
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

export default function LogisticsReturnImport({ batches }: { batches: ExportBatch[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [exportBatchId, setExportBatchId] = useState("");
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedBatch = batches.find((batch) => batch.id === exportBatchId);
  const readyCount = rows.filter((row) => row.result === "READY").length;

  async function previewReturn() {
    if (!file || !selectedBatch) return;
    setLoading(true);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("exportBatchId", selectedBatch.id);
    const response = await fetch("/api/mvp/shipments/return-import", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "回传预检失败。");
      return;
    }
    const data = payload.data;
    setRows(data.rows ?? []);
    setImportBatchId(data.importBatchId ?? null);
    const summary = data.summary ?? {};
    setMessage(data.idempotent
      ? `已打开此前的预检结果：可回填 ${summary.ready ?? 0} 条、提醒 ${summary.warning ?? 0} 条、拒绝 ${summary.rejected ?? 0} 条。`
      : `预检完成：可回填 ${summary.ready ?? 0} 条、提醒 ${summary.warning ?? 0} 条、拒绝 ${summary.rejected ?? 0} 条。`);
  }

  async function confirmReturn() {
    if (!importBatchId) return;
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/mvp/shipments/return-import/${importBatchId}/confirm`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "确认回填失败，请重新预检。" );
      return;
    }
    setMessage(`已回填 ${payload.data.summary.imported} 条物流单号。下一步：打开下方待发货订单，上传发货凭证并确认发货。`);
    window.setTimeout(() => window.location.reload(), 1200);
  }

  async function markDispatched(batch: ExportBatch) {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/mvp/logistics-export-batches/${batch.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "标记发送失败。" );
      return;
    }
    setMessage(`批次 ${batch.batchNo} 已记录为“已发给物流商”。`);
    window.setTimeout(() => window.location.reload(), 800);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-700">
            <FileSpreadsheet size={18} />
            <strong>物流商回传运单号</strong>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            先选择此前导出的批次，再上传物流商回传表。系统按该批次保存的模板版本识别列名、逐行预检，并保留原文件与审计记录。
          </p>
        </div>
      </div>

      {batches.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">最近物流导出批次</div>
          <div className="max-h-64 overflow-auto divide-y divide-slate-100">
            {batches.map((batch) => {
              const selected = batch.id === exportBatchId;
              return (
                <div key={batch.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${selected ? "bg-violet-50/60" : ""}`}>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="exportBatch"
                      value={batch.id}
                      checked={selected}
                      onChange={() => {
                        setExportBatchId(batch.id);
                        setImportBatchId(null);
                        setRows([]);
                      }}
                      disabled={!batch.canPreview || batch.status === "RETURN_IMPORTED" || batch.status === "CANCELLED"}
                      className="mt-1 h-4 w-4 border-slate-300 text-violet-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-semibold text-slate-900">{batch.batchNo}</span>
                      <span className="block text-xs text-slate-500">{batch.templateName} v{batch.templateVersion} · {batch.carrierName} · {batch.orderCount} 单 · {formatDate(batch.createdAt)}</span>
                    </span>
                  </label>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{statusLabel(batch.status)}</span>
                  <div className="flex flex-wrap gap-2">
                    {batch.canDownload && batch.exportArtifactId && <a href={`/api/mvp/logistics-batch-artifacts/${batch.exportArtifactId}/content`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Download size={13} />导出文件</a>}
                    {batch.canDownload && batch.latestReturnArtifactId && <a href={`/api/mvp/logistics-batch-artifacts/${batch.latestReturnArtifactId}/content`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Download size={13} />回传原件</a>}
                    {batch.canDispatch && batch.status === "EXPORTED" && <button type="button" disabled={loading} onClick={() => markDispatched(batch)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Send size={13} />标记已发送</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前权限范围内还没有物流导出批次。请先在上方选择订单并按物流商模板导出。</p>}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
        <label className="min-w-64 flex-1 text-sm">
          <span className="font-medium text-slate-700">已选择的导出批次</span>
          <select value={exportBatchId} onChange={(event) => { setExportBatchId(event.target.value); setImportBatchId(null); setRows([]); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={loading}>
            <option value="">请选择批次</option>
            {batches.filter((batch) => batch.canPreview && batch.status !== "RETURN_IMPORTED" && batch.status !== "CANCELLED").map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNo} · {batch.templateName} · {batch.carrierName}</option>)}
          </select>
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          选择回传表
          <input className="sr-only" type="file" accept=".xlsx,.xltx,.xls,.xlt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button disabled={!file || !selectedBatch?.canPreview || loading} onClick={previewReturn} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? <LoaderCircle className="inline animate-spin" size={16} /> : "预检回传"}
        </button>
        <button disabled={!importBatchId || !readyCount || !selectedBatch?.canConfirm || loading} onClick={confirmReturn} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">
          <CheckCircle2 className="mr-1 inline" size={16} />确认回填 {readyCount || ""}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">支持 .xlsx / .xltx。旧 .xls / .xlt 为避免运单号精度或前导零丢失，当前会提示先用 Excel 另存为 .xlsx 后预检。</p>
      {file && <p className="mt-2 text-sm text-slate-600">当前文件：{file.name}</p>}
      {message && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span>{message}</span>
          {message.startsWith("已回填") && <a href="#shipping-confirmation" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">前往上传凭证</a>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">行号</th>
                <th>订单号</th>
                <th>销售</th>
                <th>物流单号</th>
                <th>承运商</th>
                <th>预检结果</th>
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
                  <td><span className={row.result === "READY" ? "text-emerald-700" : row.result === "WARNING" ? "text-amber-700" : "text-red-700"}>{row.message}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
