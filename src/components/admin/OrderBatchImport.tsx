"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, LoaderCircle, RotateCcw, Upload } from "lucide-react";

type PreviewRow = {
  row: number;
  orderNo: string;
  shopId: string;
  customerName: string;
  phone: string;
  email: string;
  productCode: string;
  resolvedProductName?: string;
  quantity: number;
  unitPriceCents: number;
  codAmountCents: number;
  currency: string;
  errors: string[];
};

type PreviewSummary = {
  total: number;
  valid: number;
  invalid: number;
  rows: PreviewRow[];
};

export default function OrderBatchImport({ canCreate }: { canCreate: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [loadingMode, setLoadingMode] = useState<"preview" | "commit" | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "error" | "success">("info");

  function reset() {
    setFile(null);
    setPreview(null);
    setMessage("");
    setLoadingMode(null);
  }

  async function submit(mode: "preview" | "commit") {
    if (!file || !canCreate || loadingMode) return;
    setLoadingMode(mode);
    setMessage("");

    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    try {
      const response = await fetch("/api/mvp/orders/batch-import", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detailRows = payload?.error?.details?.rows;
        if (Array.isArray(detailRows)) {
          const invalid = detailRows.filter((row: PreviewRow) => row.errors.length > 0).length;
          setPreview({
            total: detailRows.length,
            valid: detailRows.length - invalid,
            invalid,
            rows: detailRows,
          });
        }
        throw new Error(payload?.error?.message ?? "批量导入失败。");
      }
      if (mode === "preview") {
        setPreview(payload.data);
        setMessage(
          payload.data.invalid > 0
            ? `预览完成：${payload.data.valid} 行可导入，${payload.data.invalid} 行需要修正。`
            : `预览完成：${payload.data.total} 行全部通过，可以确认导入。`,
        );
        setMessageType(payload.data.invalid > 0 ? "error" : "success");
      } else {
        setMessage(`导入完成：已创建 ${payload.data.imported} 个草稿订单。`);
        setMessageType("success");
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量导入失败。");
      setMessageType("error");
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-violet-700">
            <FileSpreadsheet size={19} />
            <h2 className="font-semibold">Excel 批量录单</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            先预览、逐行校验，全部通过后才会以单个事务写入。任何错误都会阻止整批导入，避免产生半批订单。
          </p>
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-700">查看模板列名</summary>
            <p className="mt-2 leading-5">
              必填：店铺ID、客户姓名、商品编码、数量、单价分。可选：订单号、电话、邮箱、收货地址、国家、城市、邮编、COD金额分、币种、付款方式。
              商品编码必须属于当前业务板块；金额统一使用最小货币单位（分）。
            </p>
          </details>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <a
              href="/api/mvp/orders/batch-import/template"
              download
              className="rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
            >
              <Download className="mr-1 inline" size={16} />
              下载标准模板
            </a>
          )}
          <label
            className={`rounded-xl border px-3 py-2 text-sm ${
              canCreate ? "cursor-pointer border-violet-200 text-violet-700 hover:bg-violet-50" : "cursor-not-allowed border-slate-200 text-slate-400"
            }`}
          >
            选择 XLSX
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canCreate || Boolean(loadingMode)}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setMessage("");
              }}
            />
          </label>
          <button
            type="button"
            disabled={!file || !canCreate || Boolean(loadingMode)}
            onClick={() => submit("preview")}
            className="rounded-xl border border-violet-200 px-3 py-2 text-sm text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingMode === "preview" ? <LoaderCircle className="inline animate-spin" size={16} /> : "预览校验"}
          </button>
          <button
            type="button"
            disabled={!preview || preview.invalid > 0 || preview.total === 0 || !canCreate || Boolean(loadingMode)}
            onClick={() => submit("commit")}
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingMode === "commit" ? (
              <LoaderCircle className="mr-1 inline animate-spin" size={16} />
            ) : (
              <Upload className="mr-1 inline" size={16} />
            )}
            确认导入{preview?.valid ? ` ${preview.valid}` : ""}
          </button>
          {(file || preview) && (
            <button
              type="button"
              disabled={Boolean(loadingMode)}
              onClick={reset}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 disabled:opacity-40"
            >
              <RotateCcw className="mr-1 inline" size={15} />
              重置
            </button>
          )}
        </div>
      </div>

      {!canCreate && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          当前账号没有订单创建权限，不能执行批量导入。
        </p>
      )}
      {file && <p className="mt-3 text-sm text-slate-600">当前文件：{file.name}（最多 500 行、10MB）</p>}
      {message && (
        <p
          aria-live="polite"
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            messageType === "success"
              ? "bg-emerald-50 text-emerald-800"
              : messageType === "error"
                ? "bg-rose-50 text-rose-800"
                : "bg-slate-50 text-slate-700"
          }`}
        >
          {messageType === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> : <CircleAlert className="mt-0.5 shrink-0" size={16} />}
          {message}
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">总计 {preview.total}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">可导入 {preview.valid}</span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">需修正 {preview.invalid}</span>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3">行号</th>
                  <th>订单 / 店铺</th>
                  <th>客户</th>
                  <th>联系方式</th>
                  <th>商品</th>
                  <th>数量</th>
                  <th>单价 / COD</th>
                  <th>校验结果</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className="border-t border-slate-100 align-top">
                    <td className="p-3 text-slate-500">{row.row}</td>
                    <td>
                      <span className="block font-medium text-slate-800">{row.orderNo || "自动生成"}</span>
                      <span className="text-xs text-slate-500">{row.shopId || "-"}</span>
                    </td>
                    <td>{row.customerName || "-"}</td>
                    <td>
                      <span className="block">{row.phone || "-"}</span>
                      <span className="text-xs text-slate-500">{row.email || "-"}</span>
                    </td>
                    <td>
                      <span className="block font-mono text-xs">{row.productCode || "-"}</span>
                      <span className="text-xs text-slate-500">{row.resolvedProductName || "未匹配"}</span>
                    </td>
                    <td>{Number.isFinite(row.quantity) ? row.quantity : "-"}</td>
                    <td>
                      <span className="block">{Number.isFinite(row.unitPriceCents) ? row.unitPriceCents : "-"} {row.currency}</span>
                      <span className="text-xs text-slate-500">COD {Number.isFinite(row.codAmountCents) ? row.codAmountCents : "-"}</span>
                    </td>
                    <td className="max-w-xs pr-3">
                      {row.errors.length === 0 ? (
                        <span className="text-emerald-700">通过</span>
                      ) : (
                        <ul className="space-y-1 text-xs text-rose-700">
                          {row.errors.map((error) => <li key={error}>• {error}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
