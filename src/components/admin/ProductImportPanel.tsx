"use client";

import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

type Row = {
  row: number;
  productCode: string;
  productName: string;
  skuCode: string;
  category: string;
  action: "CREATE_PRODUCT" | "CREATE_SKU" | "SKIP" | "REJECT";
  errors: string[];
};

type Candidate = {
  sheetName: string;
  headerRow: number;
  matchedFields: string[];
  score: number;
};

type Detection = {
  selected: Candidate;
  candidates: Candidate[];
  requiresSelection: boolean;
};

const candidateKey = (candidate: Candidate) => `${candidate.sheetName}::${candidate.headerRow}`;

function actionLabel(action: Row["action"], errors: string[]) {
  if (action === "CREATE_PRODUCT") return "新增商品";
  if (action === "CREATE_SKU") return "新增 SKU";
  if (action === "SKIP") return "已存在，跳过";
  return errors.join("；");
}

export default function ProductImportPanel({ canExport }: { canExport: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [previewedCandidateKey, setPreviewedCandidateKey] = useState("");

  const selectedCandidate = detection?.candidates.find((candidate) => candidateKey(candidate) === selectedCandidateKey) ?? null;

  async function submit(mode: "preview" | "commit") {
    if (!file) return;
    setLoading(true);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    if (selectedCandidate) {
      form.set("sheetName", selectedCandidate.sheetName);
      form.set("headerRow", String(selectedCandidate.headerRow));
    }
    const response = await fetch("/api/mvp/products/import", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setRows(payload?.error?.details?.rows ?? rows);
      const nextDetection = payload?.error?.details?.detection as Detection | undefined;
      if (nextDetection) {
        setDetection(nextDetection);
        setSelectedCandidateKey(candidateKey(nextDetection.selected));
      }
      setMessage(payload?.error?.message ?? "导入失败。");
      return;
    }
    if (mode === "preview") {
      setRows(payload.data.rows);
      const summary = payload.data.summary;
      const nextDetection = payload.data.detection as Detection;
      setDetection(nextDetection);
      const nextCandidateKey = candidateKey(nextDetection.selected);
      setSelectedCandidateKey(nextCandidateKey);
      setPreviewedCandidateKey(nextDetection.requiresSelection ? "" : nextCandidateKey);
      setMessage(
        nextDetection.requiresSelection
          ? "检测到多个同等匹配的工作表，请选择正确来源后重新预览；系统不会猜测写入。"
          : `识别 ${summary.total} 行：新增商品 ${summary.productsToCreate}，新增 SKU ${summary.skusToCreate}，跳过 ${summary.skip}，错误 ${summary.reject}。`,
      );
    } else {
      setMessage(`导入完成：新增 ${payload.data.importedProducts} 个商品、${payload.data.importedSkus} 个 SKU，跳过 ${payload.data.skipped} 行已有资料。`);
      window.setTimeout(() => window.location.reload(), 900);
    }
  }

  const canCommit = rows.length > 0
    && rows.every((row) => row.action !== "REJECT")
    && Boolean(selectedCandidate)
    && selectedCandidateKey === previewedCandidateKey;

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-700">
            <FileSpreadsheet size={18} />
            <strong>智能导入商品与 SKU</strong>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            支持腾讯文档等来源导出的 XLSX/CSV。系统会扫描工作表和表头，先预检重复与错误，确认后才写入。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.assign("/api/mvp/products/import/template")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <Download size={16} />下载标准模板
          </button>
          {canExport && (
            <button type="button" onClick={() => window.location.assign("/api/mvp/products/export")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50">
              <Download size={16} />导出商品/SKU
            </button>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            选择文件
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setRows([]);
                setMessage("");
                setDetection(null);
                setSelectedCandidateKey("");
                setPreviewedCandidateKey("");
              }}
            />
          </label>
          <button
            disabled={!file || loading}
            onClick={() => submit("preview")}
            className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 disabled:opacity-40"
          >
            {loading ? <LoaderCircle className="inline animate-spin" size={16} /> : "识别并预览"}
          </button>
          <button
            disabled={!canCommit || loading}
            onClick={() => submit("commit")}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Upload className="mr-1 inline" size={16} />确认导入
          </button>
        </div>
      </div>
      {file && <p className="mt-3 text-sm text-slate-600">当前文件：{file.name}</p>}
      {message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">{message}</p>}
      {detection && detection.candidates.length > 1 && (
        <label className="mt-3 grid max-w-xl gap-1 text-sm font-medium text-slate-700">
          识别到的工作表与表头
          <select
            value={selectedCandidateKey}
            onChange={(event) => {
              setSelectedCandidateKey(event.target.value);
              setRows([]);
              setPreviewedCandidateKey("");
              setMessage("已切换来源，请先重新识别并预览；系统不会沿用其他工作表的校验结果。");
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {detection.candidates.map((candidate) => (
              <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                {candidate.sheetName} · 第 {candidate.headerRow} 行表头 · 识别 {candidate.matchedFields.length} 个字段
              </option>
            ))}
          </select>
        </label>
      )}
      {rows.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr><th className="p-3">行</th><th>商品编码</th><th>商品名称</th><th>SKU</th><th>分类</th><th>结果</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.row} className="border-t border-slate-100">
                  <td className="p-3">{row.row}</td><td>{row.productCode || "-"}</td><td>{row.productName || "-"}</td>
                  <td>{row.skuCode || "-"}</td><td>{row.category || "-"}</td>
                  <td className={row.action === "CREATE_PRODUCT" || row.action === "CREATE_SKU" ? "text-emerald-700" : row.action === "SKIP" ? "text-amber-700" : "text-red-700"}>
                    {actionLabel(row.action, row.errors)}
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
