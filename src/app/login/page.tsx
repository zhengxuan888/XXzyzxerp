"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
    <main className="relative grid min-h-screen overflow-hidden bg-[#f5f7fb] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 top-20 size-96 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute -right-24 bottom-10 size-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-700 text-base font-black text-white">ZC</span>
          <div>
            <strong className="block text-base">择优臻选</strong>
            <span className="text-xs text-slate-400">公司运营管理系统</span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-amber-200">
            <ShieldCheck size={14} /> 诚信 · 责任 · 品质 · 长期共赢
          </span>
          <h1 className="text-5xl font-bold leading-[1.15] tracking-tight">
            与优秀的人同行
            <span className="mt-2 block bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
              为客户臻选更好的产品与服务
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
            择优秀人才、选优质资源、做卓越服务。通过科技、数据与 AI 持续提升协作效率，为客户和合作伙伴创造长期价值。
          </p>
        </div>

        <p className="relative z-10 text-xs text-slate-500">汇聚优秀，臻选未来。</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-700 text-sm font-black text-white">ZC</span>
            <div>
              <strong className="block text-sm">择优臻选</strong>
              <span className="text-xs text-slate-500">择优臻选 ERP</span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-9">
            <header className="mb-7">
              <p className="text-sm font-semibold text-violet-600">欢迎回来</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">登录工作台</h2>
              <p className="mt-2 text-sm text-slate-500">使用管理员分配的员工账号登录</p>
            </header>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-slate-700">用户名</label>
                <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
                  <UserRound size={18} className="text-slate-400" />
                  <input
                    id="login-username"
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                    autoComplete="username"
                    placeholder="请输入用户名"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-700">密码</label>
                <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
                  <LockKeyhole size={18} className="text-slate-400" />
                  <input
                    id="login-password"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                    autoComplete="current-password"
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={rememberUsername} onChange={(event) => setRememberUsername(event.target.checked)} className="size-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                记住账号（不保存密码）
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-700 to-amber-500 text-sm font-semibold text-white shadow-lg shadow-amber-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "正在登录..." : "进入工作台"}
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">登录即表示你仅在获授权的业务范围内使用系统</p>
        </div>
      </section>
    </main>
  );
}
