"use client";

import { useState } from "react";

export default function LogisticsFollowUpForm({ shipmentId }: { shipmentId: string }) {
  const [workStatus, setWorkStatus] = useState("MONITORING");
  const [note, setNote] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/mvp/shipments/${shipmentId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workStatus, note, ...(nextFollowUpAt ? { nextFollowUpAt } : {}) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "保存失败。");
      setLoading(false);
      return;
    }
    setMessage("跟进备注已保存，正在刷新...");
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">记录跟单售后</h2>
      <p className="mt-1 text-xs text-slate-500">备注必须能让下一位同事立即接手，必要时安排下次跟进。</p>
      <label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">
        <span>工作状态</span>
        <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={workStatus} onChange={(event) => setWorkStatus(event.target.value)}>
          <option value="MONITORING">正常跟踪</option>
          <option value="NEEDS_ATTENTION">需要处理</option>
          <option value="IN_PROGRESS">处理中</option>
          <option value="WAITING_CUSTOMER">等待客户</option>
          <option value="WAITING_CARRIER">等待承运商</option>
          <option value="RESOLVED">已解决</option>
          <option value="NO_ACTION_REQUIRED">无需处理</option>
          <option value="CLOSED">已关闭</option>
        </select>
      </label>
      <label className="mt-3 grid gap-1.5 text-sm font-medium text-slate-700">
        <span>跟进备注 *</span>
        <textarea required className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：已联系客户确认地址，等待客户回复；明日 10:00 再次跟进。" />
      </label>
      <label className="mt-3 grid gap-1.5 text-sm font-medium text-slate-700">
        <span>下次跟进时间</span>
        <input type="datetime-local" className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} />
      </label>
      <button disabled={loading} className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700 disabled:opacity-50">
        {loading ? "保存中..." : "保存跟进"}
      </button>
      {message && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>}
    </form>
  );
}
