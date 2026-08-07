"use client";

import { Check, Download, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  DEFAULT_RETURN_WORKBOOK_MAPPING,
  countryRouteLines,
  parseLogisticsTemplateConfiguration,
  returnMappingLines,
} from "@/lib/logistics-provider-template";

type Template = {
  id: string;
  code: string;
  name: string;
  carrierName: string;
  isActive: boolean;
  version: number;
  configuration: unknown;
};

type ExportCandidate = {
  id: string;
  orderNo: string;
  salesName: string;
  recipientName: string | null;
  countryCode: string | null;
  productSummary: string;
};

const defaultColumns = [
  "orderNo=订单号",
  "recipientName=收件人",
  "recipientPhone=联系电话",
  "recipientEmail=邮箱",
  "recipientCountryCode=国家",
  "recipientPostalCode=邮编",
  "recipientRegion=州/区域",
  "recipientCity=城市",
  "recipientAddress=详细地址",
  "productNames=产品名称",
  "quantity=数量",
  "codAmount=COD金额",
  "currency=币种",
  "customerWhatsapp=WhatsApp",
  "note=备注",
  "salesName=录单员工",
  "productConfigurations=具体型号配置",
].join("\n");

const defaultReturnMappings = returnMappingLines(DEFAULT_RETURN_WORKBOOK_MAPPING);

function filenameFromResponse(response: Response) {
  const header = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? "物流商导出订单.xlsx";
}

export default function LogisticsTemplateManager({
  templates,
  exportCandidates,
  canManage,
  canExport,
}: {
  templates: Template[];
  exportCandidates: ExportCandidate[];
  canManage: boolean;
  canExport: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates.find((template) => template.isActive)?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selectedSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const countries = useMemo(() => [...new Set(exportCandidates.map((order) => order.countryCode).filter((value): value is string => Boolean(value)))].sort(), [exportCandidates]);
  const visibleCandidates = useMemo(() => countryFilter ? exportCandidates.filter((order) => order.countryCode === countryFilter) : exportCandidates, [countryFilter, exportCandidates]);

  function toggleOrder(orderId: string) {
    setSelectedOrderIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>, templateId?: string) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(templateId ? `/api/mvp/logistics-templates/${templateId}` : "/api/mvp/logistics-templates", {
      method: templateId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "保存失败，请检查模板字段。");
      return;
    }
    window.location.reload();
  }

  async function exportSelected(template: Template) {
    if (!selectedOrderIds.length) {
      setMessage("请先勾选需要交给该物流商的订单。");
      return;
    }
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/mvp/logistics-templates/${template.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: selectedOrderIds }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLoading(false);
      setMessage(payload?.error?.message ?? "创建物流导出批次失败。");
      return;
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filenameFromResponse(response);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    const batchNo = response.headers.get("x-logistics-export-batch-no");
    setSelectedOrderIds([]);
    setLoading(false);
    setMessage(`已创建${batchNo ? `批次 ${batchNo}` : "物流导出批次"}，文件已下载。回传时请在下方选择该批次；回填运单号不等于确认发货。`);
    window.setTimeout(() => window.location.reload(), 1200);
  }

  async function deleteTemplate(template: Template) {
    if (!window.confirm(`确定删除物流商模板“${template.name}”吗？删除后不能恢复。`)) return;
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/mvp/logistics-templates/${template.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "删除失败。已用于历史导出批次的模板请改为停用。");
      return;
    }
    window.location.reload();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">物流商导出批次</h2>
          <p className="mt-1 text-sm text-slate-500">
            先选择订单，再按物流商模板导出。系统会锁定模板版本、订单清单和原始文件，防止重复交单或把回传单号直接当作已发货。
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Plus size={16} /> 新增物流商模板
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={(event) => saveTemplate(event)} className="mt-4 grid gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4 md:grid-cols-2">
          <label className="text-sm">模板编码<input name="code" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="例如 HONGYA_EU" /></label>
          <label className="text-sm">模板名称<input name="name" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="例如 鸿亚东欧代发" /></label>
          <label className="text-sm">物流商<input name="carrierName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm">导出工作表名称<input name="sheetName" defaultValue="出库订单" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm md:col-span-2">
            导出字段（每行：系统字段=表格列名；custom:字段名 读取订单补充信息；constant:值 填固定内容）
            <textarea name="columnLines" required rows={10} defaultValue={defaultColumns} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
          <label className="text-sm md:col-span-2">国家线路（每行：国家二字码=运输方式）<textarea name="countryRouteLines" rows={4} placeholder={"PT=R葡萄牙COD专线(代发)\nES=R西班牙COD专线(代发)"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" /></label>
          <label className="text-sm">表头底色（六位色值）<input name="headerFill" placeholder="例如 FFFF00" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm">表头文字颜色<input name="headerFontColor" placeholder="例如 000000" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm">回传表头扫描行数（1–20）<input name="returnHeaderScanRows" type="number" min="1" max="20" defaultValue={DEFAULT_RETURN_WORKBOOK_MAPPING.headerScanRows} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm md:col-span-2">
            回传字段识别（每行：字段=可能的列名，逗号分隔）
            <textarea name="returnMappingLines" required rows={4} defaultValue={defaultReturnMappings} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
          <button disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading && <LoaderCircle size={15} className="animate-spin" />} 保存模板
          </button>
        </form>
      )}

      {message && <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>}

      <div className="mt-4 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">选择待发货订单</p>
            <p className="text-xs text-slate-500">有权限且尚未回填运单号：{exportCandidates.length} 单；已选 {selectedOrderIds.length} 单。</p>
          </div>
          {canExport && exportCandidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label="按目的地筛选" className="h-9 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"><option value="">全部目的地（{exportCandidates.length}）</option>{countries.map((country) => <option key={country} value={country}>{country}（{exportCandidates.filter((order) => order.countryCode === country).length}）</option>)}</select>
              <button type="button" onClick={() => setSelectedOrderIds((current) => [...new Set([...current, ...visibleCandidates.map((order) => order.id)])])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">全选当前 {visibleCandidates.length} 单</button>
              <button type="button" onClick={() => setSelectedOrderIds([])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">清空</button>
              <span className="mx-1 hidden h-6 w-px bg-slate-200 xl:block" />
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} aria-label="选择物流模板" className="h-9 min-w-52 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"><option value="">选择物流模板</option>{templates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.name} · {template.carrierName}</option>)}</select>
              <button type="button" disabled={!selectedOrderIds.length || !selectedTemplateId || loading} onClick={() => { const template = templates.find((item) => item.id === selectedTemplateId); if (template) void exportSelected(template); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}导出 {selectedOrderIds.length || 0} 单</button>
            </div>
          )}
        </div>
        {visibleCandidates.length ? (
          <div className="max-h-[520px] min-h-80 overflow-auto">
            {visibleCandidates.map((order) => {
              const checked = selectedSet.has(order.id);
              return (
                <label key={order.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-violet-50/40">
                  <input type="checkbox" checked={checked} onChange={() => toggleOrder(order.id)} disabled={!canExport || loading} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-semibold text-slate-900">{order.orderNo}</span>
                    <span className="block truncate text-xs text-slate-500">销售：{order.salesName} · 收件人：{order.recipientName || "-"} · 目的地：{order.countryCode || "-"} · {order.productSummary || "未填写产品"}</span>
                  </span>
                  {checked ? <Check size={16} className="text-violet-600" /> : <span className="text-xs text-slate-400">待选择</span>}
                </label>
              );
            })}
          </div>
        ) : <p className="p-4 text-sm text-slate-500">{countryFilter ? "当前目的地没有可导出的待发货订单。" : "当前权限范围内没有可导出的待发货订单。"}</p>}
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {templates.map((template) => (
          <article key={template.id} className="rounded-xl border border-slate-200 p-3 transition hover:border-slate-300 hover:shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="truncate text-[11px] font-semibold text-violet-600" title={template.code}>{template.code} · v{template.version}</p>
                <h3 className="mt-1 truncate text-sm font-semibold text-slate-900" title={template.name}>{template.name}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{template.carrierName}</p>
              </div>
              <span className={`inline-flex rounded-full px-2 py-1 text-xs ${template.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{template.isActive ? "启用" : "停用"}</span>
            </div>
            {canManage && <button type="button" onClick={() => setEditingId(editingId === template.id ? null : template.id)} className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={13} />编辑</button>}
            {canManage && <button type="button" disabled={loading} onClick={() => deleteTemplate(template)} className="ml-1.5 mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={13} />删除</button>}
            {canManage && editingId === template.id && (() => {
              const config = parseLogisticsTemplateConfiguration(template.configuration);
              return <form onSubmit={(event) => saveTemplate(event, template.id)} className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
                <label className="text-sm">模板编码<input name="code" required defaultValue={template.code} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">模板名称<input name="name" required defaultValue={template.name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">物流商<input name="carrierName" required defaultValue={template.carrierName} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">导出工作表名称<input name="sheetName" defaultValue={config.sheetName} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">导出字段<textarea name="columnLines" required rows={10} defaultValue={config.columns.map((column) => `${column.field}=${column.header}`).join("\n")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" /></label>
                <label className="text-sm">国家线路<textarea name="countryRouteLines" rows={4} defaultValue={countryRouteLines(config.countryRoutes)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" /></label>
                <label className="text-sm">表头底色<input name="headerFill" defaultValue={config.headerFill ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">表头文字颜色<input name="headerFontColor" defaultValue={config.headerFontColor ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">回传表头扫描行数<input name="returnHeaderScanRows" type="number" min="1" max="20" defaultValue={config.returnWorkbook.headerScanRows} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm">回传字段识别<textarea name="returnMappingLines" required rows={4} defaultValue={returnMappingLines(config.returnWorkbook)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={template.isActive} />启用模板</label>
                <div className="flex gap-2">
                  <button disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">{loading && <LoaderCircle size={15} className="animate-spin" />}保存修改</button>
                  <button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><X size={14} />取消</button>
                </div>
              </form>;
            })()}
          </article>
        ))}
        {!templates.length && <p className="text-sm text-slate-500">还没有物流商模板，请先新增。模板字段和回传列名均可配置，无需改代码。</p>}
      </div>
    </section>
  );
}
