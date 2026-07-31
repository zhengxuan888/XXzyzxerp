"use client";

import { FormEvent, useMemo, useState } from "react";
import { Edit3, Hash, Plus, Save, Trash2 } from "lucide-react";

type DepartmentOption = { id: string; code: string; name: string };
type TemplateOption = { id: string; code: string; name: string };

export type OrderNumberRuleRow = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  dateFormat: string;
  timeZone: string;
  includeDepartmentCode: boolean;
  separator: string;
  sequencePadding: number;
  resetPeriod: string;
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  departmentId: string | null;
  orderTemplateId: string | null;
  department: DepartmentOption | null;
  orderTemplate: TemplateOption | null;
  _count: { orders: number };
};

type FormState = Omit<OrderNumberRuleRow, "id" | "department" | "orderTemplate" | "_count">;

const blankForm: FormState = {
  code: "",
  name: "",
  prefix: "",
  dateFormat: "YYYYMMDD",
  timeZone: "Asia/Shanghai",
  includeDepartmentCode: false,
  separator: "-",
  sequencePadding: 1,
  resetPeriod: "DAILY",
  priority: 0,
  isDefault: false,
  isActive: true,
  departmentId: null,
  orderTemplateId: null,
};

function asForm(rule: OrderNumberRuleRow): FormState {
  const { id: _id, department: _department, orderTemplate: _template, _count: _count, ...form } = rule;
  void _id;
  void _department;
  void _template;
  void _count;
  return form;
}

function sampleDate(format: string) {
  if (format === "NONE") return "";
  if (format === "YYYYMDD") return "2026731";
  if (format === "YYYY-MM-DD") return "2026-07-31";
  if (format === "YYMMDD") return "260731";
  return "20260731";
}

export default function OrderNumberingManager({
  rules,
  departments,
  templates,
  canManage,
}: {
  rules: OrderNumberRuleRow[];
  departments: DepartmentOption[];
  templates: TemplateOption[];
  canManage: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sample = useMemo(() => {
    const first = `${form.prefix}${sampleDate(form.dateFormat)}`;
    const departmentCode = form.includeDepartmentCode
      ? departments.find((department) => department.id === form.departmentId)?.code || "部门编码"
      : "";
    return [first, departmentCode, String(1).padStart(Math.max(1, Number(form.sequencePadding) || 1), "0")]
      .filter(Boolean)
      .join(form.separator);
  }, [departments, form]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setError("");
  }

  function startEdit(rule: OrderNumberRuleRow) {
    setEditingId(rule.id);
    setForm(asForm(rule));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/mvp/order-number-rules/${editingId}` : "/api/mvp/order-number-rules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "保存失败，请检查规则配置。");
        return;
      }
      window.location.reload();
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: OrderNumberRuleRow) {
    if (!canManage || !window.confirm(`确认删除编号规则“${rule.name}”？`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/mvp/order-number-rules/${rule.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "删除失败。");
        return;
      }
      window.location.reload();
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const input = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Hash size={21} /></span>
            <div>
              <h1 className="text-xl font-bold text-slate-950">订单编号规则</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">按业务板块、部门和订单模板自动匹配规则；流水号由数据库原子递增，录单与批量导入共用，避免重复编号。</p>
            </div>
          </div>
          {canManage && <button type="button" onClick={startCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm shadow-amber-200 hover:bg-amber-700"><Plus size={17} />新增编号规则</button>}
        </div>
      </section>

      {canManage && <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4"><h2 className="font-bold text-slate-900">{editingId ? "编辑编号规则" : "新增编号规则"}</h2><p className="mt-1 text-xs text-slate-500">例如前缀 ZY、日期格式 YYYY M DD、分隔符 -、流水 1 位，将生成 <strong className="text-amber-800">ZY2026731-1</strong>。</p></div>
        <label className="grid gap-1 text-sm text-slate-700">规则编码<input required maxLength={40} value={form.code} onChange={(event) => change("code", event.target.value.toUpperCase())} placeholder="例如 ZY_GENERAL" className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">规则名称<input required maxLength={80} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="例如 销售通用日编号" className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">固定前缀<input maxLength={20} value={form.prefix} onChange={(event) => change("prefix", event.target.value)} placeholder="例如 ZY" className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">日期格式<select value={form.dateFormat} onChange={(event) => change("dateFormat", event.target.value)} className={input}><option value="YYYYMMDD">YYYYMMDD（20260731）</option><option value="YYYYMDD">YYYYMDD（2026731）</option><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="YYMMDD">YYMMDD</option><option value="NONE">不含日期</option></select></label>
        <label className="grid gap-1 text-sm text-slate-700">时区<input required value={form.timeZone} onChange={(event) => change("timeZone", event.target.value)} placeholder="Asia/Shanghai" className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">分隔符<input maxLength={3} value={form.separator} onChange={(event) => change("separator", event.target.value)} placeholder="-" className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">流水号位数<input type="number" min={1} max={8} value={form.sequencePadding} onChange={(event) => change("sequencePadding", Number(event.target.value))} className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">流水号重置<select value={form.resetPeriod} onChange={(event) => change("resetPeriod", event.target.value)} className={input}><option value="DAILY">每天</option><option value="MONTHLY">每月</option><option value="YEARLY">每年</option><option value="NEVER">不重置</option></select></label>
        <label className="grid gap-1 text-sm text-slate-700">规则优先级<input type="number" min={-10000} max={10000} value={form.priority} onChange={(event) => change("priority", Number(event.target.value))} className={input} /></label>
        <label className="grid gap-1 text-sm text-slate-700">适用部门<select value={form.departmentId ?? ""} onChange={(event) => change("departmentId", event.target.value || null)} className={input}><option value="">所有部门</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm text-slate-700">适用订单模板<select value={form.orderTemplateId ?? ""} onChange={(event) => change("orderTemplateId", event.target.value || null)} className={input}><option value="">所有订单模板</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.code} · {template.name}</option>)}</select></label>
        <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"><span className="block text-xs text-slate-500">当前预览</span><strong className="mt-1 block font-mono text-amber-800">{sample || "请填写前缀或日期"}</strong></div>
        <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2 xl:col-span-4">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.includeDepartmentCode} onChange={(event) => change("includeDepartmentCode", event.target.checked)} />编号包含部门编码</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={(event) => change("isDefault", event.target.checked)} />设为业务板块默认规则</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} />启用规则</label>
          <button disabled={saving} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} />{saving ? "保存中…" : editingId ? "保存修改" : "保存规则"}</button>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2 xl:col-span-4">{error}</p>}
      </form>}

      {!canManage && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色可查看编号规则，但没有修改权限。请由管理员在角色权限中授予 <code>order.numbering.manage</code>。</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">现有规则</h2><p className="mt-1 text-xs text-slate-500">部门 + 模板规则优先于一般规则；同一层级再按优先级排序。</p></div>
        {rules.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">暂无可用规则。创建第一条默认规则后才能录入新订单。</div> : <div className="divide-y divide-slate-100">{rules.map((rule) => <article key={rule.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{rule.name}</strong>{rule.isDefault && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">默认</span>}<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{rule.isActive ? "启用" : "停用"}</span></div><p className="mt-1 font-mono text-xs text-slate-500">{rule.code} · 预览：{`${rule.prefix}${sampleDate(rule.dateFormat)}${rule.includeDepartmentCode ? `${rule.separator}${rule.department?.code ?? "部门"}` : ""}${rule.separator}${String(1).padStart(rule.sequencePadding, "0")}`}</p><p className="mt-2 text-xs text-slate-500">范围：{rule.department ? `${rule.department.code} · ${rule.department.name}` : "所有部门"} · {rule.orderTemplate ? `${rule.orderTemplate.code} · ${rule.orderTemplate.name}` : "所有订单模板"} · 已用于 {rule._count.orders} 单</p></div>{canManage && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => startEdit(rule)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-amber-300 hover:text-amber-800"><Edit3 size={15} />编辑</button><button type="button" disabled={saving || rule.isDefault || rule._count.orders > 0} onClick={() => void deleteRule(rule)} title={rule.isDefault || rule._count.orders > 0 ? "默认规则或已有历史订单的规则只能停用，不能删除。" : "删除规则"} className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} />删除</button></div>}</article>)}</div>}
      </section>
    </div>
  );
}
