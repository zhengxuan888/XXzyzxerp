"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type Status = {
  ship24: { enabled: boolean; configured: boolean; apiKeyHint: string | null; baseUrl: string; webhookSecretConfigured: boolean; webhookSecretHint: string | null; updatedAt: string | null };
  feishu: { enabled: boolean; configured: boolean; botWebhookUrlConfigured: boolean; botWebhookUrlHint: string | null; botSecretConfigured: boolean; botSecretHint: string | null; verificationTokenConfigured: boolean; verificationTokenHint: string | null; updatedAt: string | null };
  googleTranslate: { enabled: boolean; configured: boolean; apiKeyHint: string | null; updatedAt: string | null };
  googleVision: { enabled: boolean; configured: boolean; apiKeyHint: string | null; updatedAt: string | null };
  googleAddressValidation: { enabled: boolean; configured: boolean; apiKeyHint: string | null; updatedAt: string | null };
};

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100";

function SecretField({ label, hint, value, onChange, placeholder }: { label: string; hint: string | null; value: string; onChange: (value: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="grid gap-1.5 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    <span className="relative">
      <input type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={hint ? `当前 ${hint}；留空则不替换` : placeholder} className={`${inputClass} pr-11`} />
      <button type="button" aria-label={visible ? `隐藏${label}` : `显示${label}`} onClick={() => setVisible((current) => !current)} className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  </label>;
}

export default function IntegrationCredentialSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"SHIP24" | "FEISHU" | "GOOGLE_TRANSLATE" | "GOOGLE_VISION" | "GOOGLE_ADDRESS_VALIDATION" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ship24, setShip24] = useState({ enabled: false, apiKey: "", baseUrl: "https://api.ship24.com", webhookSecret: "" });
  const [feishu, setFeishu] = useState({ enabled: false, botWebhookUrl: "", botSecret: "", verificationToken: "" });
  const [googleTranslate, setGoogleTranslate] = useState({ enabled: false, apiKey: "" });
  const [googleVision, setGoogleVision] = useState({ enabled: false, apiKey: "" });
  const [googleAddressValidation, setGoogleAddressValidation] = useState({ enabled: false, apiKey: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/mvp/integration-credentials", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: payload?.error?.message ?? "接口配置读取失败。" });
      return;
    }
    const next = payload.data as Status;
    setStatus(next);
    setShip24((current) => ({ ...current, enabled: next.ship24.enabled, baseUrl: next.ship24.baseUrl }));
    setFeishu((current) => ({ ...current, enabled: next.feishu.enabled }));
    setGoogleTranslate((current) => ({ ...current, enabled: next.googleTranslate.enabled }));
    setGoogleVision((current) => ({ ...current, enabled: next.googleVision.enabled }));
    setGoogleAddressValidation((current) => ({ ...current, enabled: next.googleAddressValidation.enabled }));
  }

  useEffect(() => {
    void fetch("/api/mvp/integration-credentials", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        setLoading(false);
        if (!response.ok) {
          setMessage({ type: "error", text: payload?.error?.message ?? "接口配置读取失败。" });
          return;
        }
        const next = payload.data as Status;
        setStatus(next);
        setShip24((current) => ({ ...current, enabled: next.ship24.enabled, baseUrl: next.ship24.baseUrl }));
        setFeishu((current) => ({ ...current, enabled: next.feishu.enabled }));
        setGoogleTranslate((current) => ({ ...current, enabled: next.googleTranslate.enabled }));
        setGoogleVision((current) => ({ ...current, enabled: next.googleVision.enabled }));
        setGoogleAddressValidation((current) => ({ ...current, enabled: next.googleAddressValidation.enabled }));
      });
  }, []);

  async function save(provider: "SHIP24" | "FEISHU" | "GOOGLE_TRANSLATE" | "GOOGLE_VISION" | "GOOGLE_ADDRESS_VALIDATION") {
    setSaving(provider);
    setMessage(null);
    const body = provider === "SHIP24" ? { ship24 } : provider === "FEISHU" ? { feishu } : provider === "GOOGLE_TRANSLATE" ? { googleTranslate } : provider === "GOOGLE_VISION" ? { googleVision } : { googleAddressValidation };
    const response = await fetch("/api/mvp/integration-credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setSaving(null);
    if (!response.ok) {
      setMessage({ type: "error", text: payload?.error?.message ?? "接口配置保存失败。" });
      return;
    }
    setShip24((current) => ({ ...current, apiKey: "", webhookSecret: "" }));
    setFeishu((current) => ({ ...current, botWebhookUrl: "", botSecret: "", verificationToken: "" }));
    setGoogleTranslate((current) => ({ ...current, apiKey: "" }));
    setGoogleVision((current) => ({ ...current, apiKey: "" }));
    setGoogleAddressValidation((current) => ({ ...current, apiKey: "" }));
    const providerLabel = provider === "SHIP24" ? "Ship24" : provider === "FEISHU" ? "飞书" : provider === "GOOGLE_TRANSLATE" ? "Google 翻译" : provider === "GOOGLE_VISION" ? "Google 图片识别" : "Google 地址验证";
    setMessage({ type: "success", text: `${providerLabel}接口配置已安全保存并立即生效。` });
    await load();
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><KeyRound size={19} /></span>
        <div><h2 className="font-semibold text-slate-900">第三方接口与密钥</h2><p className="mt-0.5 text-sm text-slate-500">管理员可直接替换；已保存内容只显示末四位。</p></div>
      </div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><ShieldCheck size={14} />数据库加密存储</span>
    </div>
    {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />正在读取接口状态…</div> :
      <div className="grid divide-y divide-slate-100 lg:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Ship24</h3><p className="text-xs text-slate-500">物流轨迹同步与 Webhook 验签</p></div>{status?.ship24.configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已配置</span>}</div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={ship24.enabled} onChange={(event) => setShip24({ ...ship24, enabled: event.target.checked })} className="h-4 w-4 accent-amber-600" />启用 Ship24 接口</label>
          <SecretField label="API Key" hint={status?.ship24.apiKeyHint ?? null} value={ship24.apiKey} onChange={(apiKey) => setShip24({ ...ship24, apiKey })} placeholder="填写 Ship24 API Key" />
          <label className="grid gap-1.5 text-sm"><span className="font-medium text-slate-700">API 地址</span><input value={ship24.baseUrl} onChange={(event) => setShip24({ ...ship24, baseUrl: event.target.value })} className={inputClass} /></label>
          <SecretField label="Webhook Secret" hint={status?.ship24.webhookSecretHint ?? null} value={ship24.webhookSecret} onChange={(webhookSecret) => setShip24({ ...ship24, webhookSecret })} placeholder="选填，用于回调验签" />
          <button type="button" disabled={saving !== null} onClick={() => void save("SHIP24")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{saving === "SHIP24" && <Loader2 className="animate-spin" size={16} />}保存 Ship24</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">飞书 / Lark</h3><p className="text-xs text-slate-500">机器人提醒与事件订阅验证</p></div>{status?.feishu.configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已配置</span>}</div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={feishu.enabled} onChange={(event) => setFeishu({ ...feishu, enabled: event.target.checked })} className="h-4 w-4 accent-amber-600" />启用飞书接口</label>
          <SecretField label="机器人 Webhook URL" hint={status?.feishu.botWebhookUrlHint ?? null} value={feishu.botWebhookUrl} onChange={(botWebhookUrl) => setFeishu({ ...feishu, botWebhookUrl })} placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" />
          <SecretField label="机器人签名 Secret" hint={status?.feishu.botSecretHint ?? null} value={feishu.botSecret} onChange={(botSecret) => setFeishu({ ...feishu, botSecret })} placeholder="选填，机器人启用签名时填写" />
          <SecretField label="事件验证 Token" hint={status?.feishu.verificationTokenHint ?? null} value={feishu.verificationToken} onChange={(verificationToken) => setFeishu({ ...feishu, verificationToken })} placeholder="接收飞书事件时填写" />
          <button type="button" disabled={saving !== null} onClick={() => void save("FEISHU")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving === "FEISHU" && <Loader2 className="animate-spin" size={16} />}保存飞书</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Google 轨迹翻译</h3><p className="text-xs text-slate-500">新轨迹自动翻译，相同原文读取缓存</p></div>{status?.googleTranslate.configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已配置</span>}</div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={googleTranslate.enabled} onChange={(event) => setGoogleTranslate({ ...googleTranslate, enabled: event.target.checked })} className="h-4 w-4 accent-amber-600" />启用 Google 翻译</label>
          <SecretField label="API Key" hint={status?.googleTranslate.apiKeyHint ?? null} value={googleTranslate.apiKey} onChange={(apiKey) => setGoogleTranslate({ ...googleTranslate, apiKey })} placeholder="填写 Google Cloud Translation API Key" />
          <p className="text-xs leading-5 text-slate-500">仅由服务器调用；保留轨迹原文，译文写入缓存，人工核对结果优先。</p>
          <button type="button" disabled={saving !== null} onClick={() => void save("GOOGLE_TRANSLATE")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{saving === "GOOGLE_TRANSLATE" && <Loader2 className="animate-spin" size={16} />}保存 Google 翻译</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Google 图片识别</h3><p className="text-xs text-slate-500">识别客户截图中的收件信息</p></div>{status?.googleVision.configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已配置</span>}</div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={googleVision.enabled} onChange={(event) => setGoogleVision({ ...googleVision, enabled: event.target.checked })} className="h-4 w-4 accent-amber-600" />启用 Google Cloud Vision</label>
          <SecretField label="API Key" hint={status?.googleVision.apiKeyHint ?? null} value={googleVision.apiKey} onChange={(apiKey) => setGoogleVision({ ...googleVision, apiKey })} placeholder="填写启用 Cloud Vision API 的密钥" />
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-900">
            <p className="font-semibold">使用方式</p>
            <p>员工在录单页拖入图片、粘贴截图或选择文件。系统只提取文字并生成字段预览，员工确认后才写入订单。</p>
            <p className="mt-1 text-blue-700">支持 JPG、PNG、WebP，单张不超过 5MB；不会自动提交订单。</p>
          </div>
          <button type="button" disabled={saving !== null} onClick={() => void save("GOOGLE_VISION")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving === "GOOGLE_VISION" && <Loader2 className="animate-spin" size={16} />}保存图片识别</button>
        </div>
        <div className="space-y-4 border-l border-slate-100 p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Google 地址验证</h3><p className="text-xs text-slate-500">录单时检查并修正收件地址</p></div>{status?.googleAddressValidation.configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />已配置</span>}</div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={googleAddressValidation.enabled} onChange={(event) => setGoogleAddressValidation({ ...googleAddressValidation, enabled: event.target.checked })} className="h-4 w-4 accent-amber-600" />启用地址验证</label>
          <SecretField label="API Key" hint={status?.googleAddressValidation.apiKeyHint ?? null} value={googleAddressValidation.apiKey} onChange={(apiKey) => setGoogleAddressValidation({ ...googleAddressValidation, apiKey })} placeholder="填写启用 Address Validation API 的密钥" />
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs leading-5 text-emerald-900"><p className="font-semibold">使用方式</p><p>员工填完国家、邮编、城市和详细地址后点击“检测地址”。系统展示 Google 建议地址，员工可以采用建议或保留原地址。</p><p className="mt-1 text-emerald-700">验证仅作核对，不会阻止保存订单。</p></div>
          <button type="button" disabled={saving !== null} onClick={() => void save("GOOGLE_ADDRESS_VALIDATION")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving === "GOOGLE_ADDRESS_VALIDATION" && <Loader2 className="animate-spin" size={16} />}保存地址验证</button>
        </div>
      </div>}
    {message && <div role="status" className={`border-t px-5 py-3 text-sm ${message.type === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-700"}`}>{message.text}</div>}
  </section>;
}
