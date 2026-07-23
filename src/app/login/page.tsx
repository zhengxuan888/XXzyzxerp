"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setError(payload?.error || "登录失败");
      setLoading(false);
      return;
    }

    router.push("/admin");
    setLoading(false);
  }

  return (
    <main className="mx-auto mt-20 flex w-full max-w-md flex-col gap-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">ERP V2 登录</h1>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          用户名
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          密码
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="rounded bg-black py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/50"
          disabled={loading}
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
