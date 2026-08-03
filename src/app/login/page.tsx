"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, Eye, EyeOff, LockKeyhole, ShieldCheck, Truck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("erp-remember-username") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload) {
      setError(payload?.error?.message ?? payload?.error ?? "账号或密码错误，请重新输入");
      setLoading(false);
      return;
    }

    if (rememberUsername) window.localStorage.setItem("erp-remember-username", username.trim());
    else window.localStorage.removeItem("erp-remember-username");

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f6f8] px-4 py-5 text-slate-950 sm:px-6 sm:py-8 lg:grid lg:place-items-center lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(184,137,45,0.12),transparent_28%),radial-gradient(circle_at_88%_78%,rgba(79,110,247,0.08),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative mx-auto grid w-full max-w-[1180px] overflow-hidden rounded-[28px] border border-white/90 bg-white/70 shadow-[0_30px_90px_rgba(15,23,42,0.11)] backdrop-blur-2xl lg:min-h-[700px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-white/80 bg-[linear-gradient(145deg,rgba(255,252,245,0.96),rgba(248,250,252,0.9))] p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -left-20 -top-24 size-72 rounded-full border-[56px] border-amber-100/70" />
          <div className="absolute -bottom-28 -right-20 size-80 rounded-full border-[64px] border-blue-100/50" />

          <div className="relative z-10 flex items-center gap-3">
            <Image src="/zc-logo.svg" alt="择优臻选" width={48} height={48} priority className="size-12 rounded-[13px] shadow-[0_10px_28px_rgba(184,137,45,0.2)]" />
            <div>
              <strong className="block text-[17px] font-bold tracking-tight">择优臻选 ERP</strong>
              <span className="mt-0.5 block text-xs text-slate-500">电商业务运营系统</span>
            </div>
          </div>

          <div className="relative z-10 max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/75 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm">
              <ShieldCheck size={14} /> 安全、清晰、协同
            </span>
            <h1 className="mt-6 text-[42px] font-bold leading-[1.18] tracking-[-0.035em] text-slate-950">
              让每一笔业务，<br />都有清晰的进度。
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-slate-600">
              从订单录入、审核发货到物流售后，在同一个工作台完成协作与追踪。
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
              {[
                { icon: Boxes, label: "订单与商品", tone: "bg-amber-50 text-amber-700" },
                { icon: Truck, label: "物流与售后", tone: "bg-emerald-50 text-emerald-700" },
                { icon: ShieldCheck, label: "权限与审计", tone: "bg-blue-50 text-blue-700" },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.label} className="rounded-2xl border border-white bg-white/72 p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                  <span className={`grid size-8 place-items-center rounded-lg ${item.tone}`}><Icon size={16} /></span>
                  <span className="mt-3 block text-xs font-semibold text-slate-700">{item.label}</span>
                </div>;
              })}
            </div>
          </div>

          <p className="relative z-10 text-xs text-slate-400">汇聚优秀，臻选未来。</p>
        </section>

        <section className="flex min-h-[calc(100vh-40px)] items-center justify-center p-5 sm:p-10 lg:min-h-0 lg:p-14">
          <div className="w-full max-w-[410px]">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <Image src="/zc-logo.svg" alt="择优臻选" width={44} height={44} priority className="size-11 rounded-xl shadow-[0_8px_22px_rgba(184,137,45,0.18)]" />
              <div><strong className="block text-base">择优臻选 ERP</strong><span className="text-xs text-slate-500">电商业务运营系统</span></div>
            </div>

            <header className="mb-8">
              <p className="text-xs font-semibold tracking-[0.14em] text-amber-700">欢迎回来</p>
              <h2 className="mt-3 text-[32px] font-bold tracking-[-0.035em] text-slate-950">登录工作台</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">员工账号登录</p>
            </header>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-slate-700">用户名</label>
                <div className="flex h-[52px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white/78 px-3.5 shadow-sm transition duration-200 focus-within:border-amber-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-amber-100/70">
                  <UserRound size={18} className="text-slate-400" />
                  <input id="login-username" required value={username} onChange={(event) => setUsername(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" autoComplete="username" placeholder="请输入用户名" />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-700">密码</label>
                <div className="flex h-[52px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white/78 px-3.5 shadow-sm transition duration-200 focus-within:border-amber-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-amber-100/70">
                  <LockKeyhole size={18} className="text-slate-400" />
                  <input id="login-password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" autoComplete="current-password" placeholder="请输入密码" />
                  <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)} className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={rememberUsername} onChange={(event) => setRememberUsername(event.target.checked)} className="size-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                记住账号（不保存密码）
              </label>

              {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}

              <button type="submit" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-[0_16px_34px_rgba(15,23,42,0.22)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading}>
                {loading ? "正在登录..." : "进入工作台"}{!loading && <ArrowRight size={17} />}
              </button>
            </form>

          </div>
        </section>
      </div>
    </main>
  );
}
