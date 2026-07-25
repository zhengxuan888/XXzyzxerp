"use client";

import { Download, LoaderCircle, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

type Template = {
  id: string;
  code: string;
  name: string;
  carrierName: string;
};

const defaultColumns = [
  "orderNo=订单号",
  "recipientName=收件人",
  "recipientPhone=联系电话",
  "recipientCountryCode=国家",
  "recipientPostalCode=邮编",
  "recipientCity=城市",
  "recipientAddress=详细地址",
  "productNames=产品名称",
  "quantity=数量",
  "codAmount=代收金额",
  "currency=币种",
].join("\n");

export default function LogisticsTemplateManager({
  templates,
  waitingOrderCount,
  canManage,
  canExport,
}: {
  templates: Template[];
  waitingOrderCount: number;
  canManage: boolean;
  canExport: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/mvp/logistics-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "保存失败");
      return;
    }
    window.location.reload();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">物流商导出模板</h2>
          <p className="mt-1 text-sm text-slate-500">
            当前有 {waitingOrderCount} 个核单通过的待发货订单。模板字段与列顺序均可配置。
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={16} /> 新增物流商模板
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createTemplate} className="mt-4 grid gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4 md:grid-cols-2">
          <label className="text-sm">模板编码<input name="code" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="例如 HONGYA_EU" /></label>
          <label className="text-sm">模板名称<input name="name" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="例如 鸿亚东欧代发" /></label>
          <label className="text-sm">物流商<input name="carrierName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm">工作表名称<input name="sheetName" defaultValue="出库订单" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm md:col-span-2">
            导出字段（每行：系统字段=表格列名）
            <textarea name="columnLines" required rows={12} defaultValue={defaultColumns} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
          <button disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading && <LoaderCircle size={15} className="animate-spin" />} 保存模板
          </button>
        </form>
      )}

      {message && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article key={template.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-violet-600">{template.code}</p>
            <h3 className="mt-1 font-semibold text-slate-900">{template.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{template.carrierName}</p>
            {canExport && (
              <a
                href={`/api/mvp/logistics-templates/${template.id}/export`}
                className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  waitingOrderCount ? "bg-slate-900 text-white" : "pointer-events-none bg-slate-100 text-slate-400"
                }`}
              >
                <Download size={15} /> 导出待发货订单
              </a>
            )}
          </article>
        ))}
        {!templates.length && <p className="text-sm text-slate-500">还没有物流商模板，请先新增。</p>}
      </div>
    </section>
  );
}
