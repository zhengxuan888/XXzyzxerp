"use client";

import { useEffect, useState } from "react";

export default function DailyGoalGate({ roleCode }: { roleCode?: string | null }) {
  const exempt = ["platform_admin", "business_manager", "legacy_admin", "legacy_ceo"].includes(roleCode ?? "");
  const [state, setState] = useState({ loading: !exempt, completed: exempt, date: "" });
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (exempt) return;
    fetch("/api/mvp/daily-goal-gate", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setState({ loading: false, completed: Boolean(data.completed), date: data.date ?? "" }))
      .catch(() => setState((value) => ({ ...value, loading: false })));
  }, [exempt]);

  if (exempt || state.completed) return null;

  async function submit() {
    const targetOrderCount = Number(count);
    if (!Number.isInteger(targetOrderCount) || targetOrderCount < 1) return setError("请填写大于 0 的今日开单目标。");
    if (!note.trim()) return setError("请填写今天的工作目标。");
    setSaving(true);
    setError("");
    const response = await fetch("/api/mvp/daily-goal-gate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetOrderCount, note: note.trim() }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return setError(body.error || "保存失败，请重试。");
    }
    setState((value) => ({ ...value, completed: true }));
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
    <section className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-7 shadow-2xl" role="dialog" aria-modal="true">
      <p className="text-sm font-semibold text-amber-700">{state.date || "今天"} · 上班打卡成功</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">填写今日目标</h2>
      <p className="mt-2 text-sm text-slate-500">保存后进入工作台，今日只需填写一次。</p>
      <label className="mt-6 block text-sm font-semibold text-slate-700">今日开单目标 <span className="text-rose-500">*</span>
        <input value={count} onChange={(event) => setCount(event.target.value)} type="number" min="1" autoFocus placeholder="例如：5" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
      </label>
      <label className="mt-4 block text-sm font-semibold text-slate-700">今日工作目标 <span className="text-rose-500">*</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="写下今天要完成的重点工作" className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 p-4 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
      </label>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button type="button" onClick={submit} disabled={saving || state.loading} className="mt-5 h-12 w-full rounded-xl bg-slate-950 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{state.loading ? "正在检查..." : saving ? "正在保存..." : "保存并进入工作台"}</button>
    </section>
  </div>;
}
