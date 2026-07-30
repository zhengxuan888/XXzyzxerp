"use client";

import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { FinanceSegregationPolicy } from "@/lib/finance/segregation-policy";

type PolicyView = FinanceSegregationPolicy & {
  configured: boolean;
  version: number | null;
  updatedAt: string | null;
};

type PolicyKey = keyof FinanceSegregationPolicy;

const controls: Array<{ key: PolicyKey; title: string; description: string }> = [
  {
    key: "requireStatementApproverDifferentFromCreator",
    title: "结算单：制单人与审批人不同",
    description: "防止同一人创建并批准结算单。",
  },
  {
    key: "requireStatementPosterDifferentFromCreator",
    title: "结算单：制单人与过账人不同",
    description: "防止制单人直接把自己的结算单过账。",
  },
  {
    key: "requireStatementPosterDifferentFromApprover",
    title: "结算单：审批人与过账人不同",
    description: "把审批与最终过账拆分为两道岗位。",
  },
  {
    key: "requirePaymentApproverDifferentFromCreator",
    title: "付款：制单人与审批人不同",
    description: "防止同一人创建并批准付款记录。",
  },
  {
    key: "requirePaymentPosterDifferentFromCreator",
    title: "付款：制单人与过账人不同",
    description: "防止付款制单人直接过账。",
  },
  {
    key: "requirePaymentPosterDifferentFromApprover",
    title: "付款：审批人与过账人不同",
    description: "把付款审批与最终过账拆分为两道岗位。",
  },
  {
    key: "requireReconciliationResolverDifferentFromCreator",
    title: "对账：建议创建人与处理人不同",
    description: "防止同一员工创建后自行确认、拒绝或忽略对账建议。",
  },
];

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "尚未单独保存，当前采用严格默认规则";
}

export default function FinanceControlPolicyWorkbench({ initial, canManage }: { initial: PolicyView; canManage: boolean }) {
  const [policy, setPolicy] = useState<PolicyView>(initial);
  const [savedPolicy, setSavedPolicy] = useState<PolicyView>(initial);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const hasChanges = controls.some((control) => policy[control.key] !== savedPolicy[control.key]);

  async function save() {
    if (!hasChanges) return;
    if (reason.trim().length < 3) {
      setMessage("请填写至少 3 个字符的变更原因。");
      return;
    }

    setSaving(true);
    setMessage("");
    const config = controls.reduce<FinanceSegregationPolicy>((result, control) => {
      result[control.key] = policy[control.key];
      return result;
    }, {} as FinanceSegregationPolicy);

    try {
      const response = await fetch("/api/mvp/finance/control-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, expectedVersion: policy.version, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "保存失败，请稍后重试。");

      const next = payload.data as PolicyView;
      setPolicy(next);
      setSavedPolicy(next);
      setReason("");
      setMessage("内控规则已原子保存并写入审计日志；后续审批或过账会立即按新规则校验。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
    <header className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20"><ShieldCheck size={24} /></span>
        <div>
          <p className="text-sm font-semibold text-amber-700">财务与审批</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">财务内控规则</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">这里配置当前业务板块的制单、审批和过账是否必须由不同人员完成。权限决定谁能操作；内控规则额外阻止同一人完成受控链路。</p>
          <p className="mt-2 text-xs text-slate-500">{policy.configured ? `版本 ${policy.version ?? "-"} · 上次保存：${formatTime(policy.updatedAt)}` : formatTime(policy.updatedAt)}</p>
        </div>
      </div>
    </header>

    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
      <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p><strong>建议保持全部开启。</strong> 关闭任一项只会放宽当前业务板块的岗位分离，不会授予新的操作权限。每次变更都必须写明原因，并以版本校验和审计日志一起保存。</p></div>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold text-slate-900">审批与过账分离</h2><p className="mt-1 text-sm text-slate-500">权限、范围、Membership 和附加授权仍由后端独立校验，不能依赖这个页面的显示状态。</p></div>
      <div className="divide-y divide-slate-100">
        {controls.map((control) => <label key={control.key} className="flex cursor-pointer items-start gap-4 px-6 py-5 hover:bg-slate-50">
          <input
            type="checkbox"
            checked={policy[control.key]}
            disabled={!canManage || saving}
            onChange={(event) => setPolicy((current) => ({ ...current, [control.key]: event.target.checked }))}
            className="mt-1 h-4 w-4 rounded border-slate-300 accent-amber-600 disabled:cursor-not-allowed"
          />
          <span><strong className="text-sm text-slate-900">{control.title}</strong><small className="mt-1 block text-sm text-slate-500">{control.description}</small></span>
        </label>)}
      </div>
      {canManage && <div className="border-t border-slate-100 px-6 py-5">
        <label className="block text-sm font-medium text-slate-800" htmlFor="finance-control-policy-reason">变更原因</label>
        <textarea
          id="finance-control-policy-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={saving}
          maxLength={500}
          rows={3}
          placeholder="例如：经财务负责人复核，临时调整当前业务板块的岗位分离规则"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <p className="mt-2 text-xs text-slate-500">保存会校验版本；如其他人先保存，请刷新页面后重新确认。</p>
      </div>}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
        {canManage ? <Button type="button" onClick={save} disabled={saving || !hasChanges} className="bg-amber-600 text-white hover:bg-amber-700">{saving ? <><Loader2 className="animate-spin" size={16} />保存中…</> : "保存财务内控规则"}</Button> : <span className="text-sm text-slate-500">你可以查看规则；需要拥有“配置财务内控规则”动作且具备业务板块范围，才能修改。</span>}
        {message && <span role="status" className="text-sm text-slate-600">{message}</span>}
      </div>
    </section>
  </main>;
}
