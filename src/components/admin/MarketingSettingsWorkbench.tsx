"use client";

import {
  BarChart3,
  CircleAlert,
  ClipboardList,
  Eye,
  EyeOff,
  Layers3,
  LoaderCircle,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Tags,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import type {
  MarketingWorkbenchCard,
  MarketingWorkbenchCardAudience,
  MarketingWorkbenchCardKind,
  MarketingWorkbenchConfig,
  MarketingWorkbenchZone,
} from "@/lib/marketing-workbench-config";

type SelectOption = { id: string; name: string };

type MarketingSource = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  departmentId: string | null;
  siteId: string | null;
  sortOrder: number;
  isActive: boolean;
};

type MarketingMetric = {
  id: string;
  code: string;
  name: string;
  valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
  aggregation: "SUM" | "AVG" | "LAST";
  calculation: "DIRECT" | "RATIO";
  numeratorMetricCode: string | null;
  denominatorMetricCode: string | null;
  multiplier: string | null;
  inputRequired: boolean;
  showOnWorkbench: boolean;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type CreativeStatus = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  isTerminal: boolean;
  sortOrder: number;
  isActive: boolean;
};

type MarketingTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ConfigurationPayload = {
  sources: MarketingSource[];
  metrics: MarketingMetric[];
  statuses: CreativeStatus[];
  tags: MarketingTag[];
  departments: Array<SelectOption & { parentId: string | null }>;
  sites: Array<SelectOption & { departmentId: string | null }>;
  // These two fields are deliberately optional.  The API will populate them
  // once the organization selector contract is exposed to this page.
  roles?: SelectOption[];
  memberships?: SelectOption[];
  permissions: {
    canConfigure: boolean;
    canManageSources: boolean;
    canManageMetrics: boolean;
    canManageTags: boolean;
  };
};

type SourceForm = {
  id?: string;
  code: string;
  name: string;
  sourceKind: string;
  parentId: string;
  departmentId: string;
  siteId: string;
  sortOrder: number;
  isActive: boolean;
};

type MetricForm = {
  id?: string;
  code: string;
  name: string;
  valueType: MarketingMetric["valueType"];
  aggregation: MarketingMetric["aggregation"];
  calculation: MarketingMetric["calculation"];
  numeratorMetricCode: string;
  denominatorMetricCode: string;
  multiplier: string;
  inputRequired: boolean;
  showOnWorkbench: boolean;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

type StatusForm = {
  id?: string;
  code: string;
  name: string;
  color: string;
  isTerminal: boolean;
  sortOrder: number;
  isActive: boolean;
};

type TagForm = {
  id?: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
};

type TabKey = "sources" | "metrics" | "creative" | "cards";

const emptySource = (): SourceForm => ({
  code: "",
  name: "",
  sourceKind: "SOURCE",
  parentId: "",
  departmentId: "",
  siteId: "",
  sortOrder: 100,
  isActive: true,
});

const emptyMetric = (): MetricForm => ({
  code: "",
  name: "",
  valueType: "COUNT",
  aggregation: "SUM",
  calculation: "DIRECT",
  numeratorMetricCode: "",
  denominatorMetricCode: "",
  multiplier: "100",
  inputRequired: false,
  showOnWorkbench: false,
  description: "",
  sortOrder: 100,
  isActive: true,
});

const emptyStatus = (): StatusForm => ({
  code: "",
  name: "",
  color: "#b88718",
  isTerminal: false,
  sortOrder: 100,
  isActive: true,
});

const emptyTag = (): TagForm => ({
  name: "",
  color: "#64748b",
  sortOrder: 100,
  isActive: true,
});

const tabItems: Array<{ key: TabKey; label: string; hint: string; icon: typeof Layers3 }> = [
  { key: "sources", label: "渠道与来源", hint: "按组织范围维护可选投放渠道、账户或来源。", icon: Layers3 },
  { key: "metrics", label: "日报指标", hint: "先定义原始事实，再由系统计算比率。", icon: BarChart3 },
  { key: "creative", label: "素材分类", hint: "统一素材状态与可复用标签。", icon: Palette },
  { key: "cards", label: "工作台卡片", hint: "配置位置、顺序、显示与适用范围。", icon: ClipboardList },
];

const queueOptions: Array<{ value: MarketingWorkbenchCard["queueKey"]; label: string; description: string }> = [
  { value: "MY_DRAFT_REPORTS", label: "我的待完成日报", description: "本人尚未完成的草稿日报。" },
  { value: "RETURNED_REPORTS", label: "退回待修改", description: "被退回、需要补充的日报。" },
  { value: "PENDING_REVIEW", label: "待审核日报", description: "当前权限范围内等待审核的日报。" },
  { value: "MY_CREATIVES", label: "我的素材", description: "当前岗位负责的素材。" },
];

const stableActionHints = [
  "marketing.report.create",
  "marketing.report.read",
  "marketing.kpi.read",
  "marketing.creative.read",
];

function readSelectedValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions, (option) => option.value);
}

function formatError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" && error.message ? error.message : fallback;
}

function cardKeyFromLabel(label: string, existing: MarketingWorkbenchCard[]) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "card";
  const base = `card-${normalized}`;
  let key = base;
  let suffix = 2;
  while (existing.some((card) => card.key === key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  return key;
}

function defaultHrefForAction(actionKey: string) {
  if (actionKey.startsWith("marketing.report")) return "/admin/marketing/reports";
  if (actionKey.startsWith("marketing.kpi")) return "/admin/marketing/kpis";
  if (actionKey.startsWith("marketing.creative")) return "/admin/marketing/creatives";
  return "/admin/marketing";
}

function SelectScope({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string[];
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-600">
      <span>{label}（留空=不限）</span>
      <select
        multiple
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(readSelectedValues(event))}
        className="min-h-24 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  );
}

export default function MarketingSettingsWorkbench() {
  const [activeTab, setActiveTab] = useState<TabKey>("sources");
  const [data, setData] = useState<ConfigurationPayload | null>(null);
  const [cards, setCards] = useState<MarketingWorkbenchConfig>({ cards: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sourceForm, setSourceForm] = useState<SourceForm>(emptySource);
  const [metricForm, setMetricForm] = useState<MetricForm>(emptyMetric);
  const [statusForm, setStatusForm] = useState<StatusForm>(emptyStatus);
  const [tagForm, setTagForm] = useState<TagForm>(emptyTag);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configurationResponse, cardsResponse] = await Promise.all([
        fetch("/api/mvp/marketing/config", { cache: "no-store" }),
        fetch("/api/mvp/marketing/workbench-settings", { cache: "no-store" }),
      ]);
      const [configurationPayload, cardsPayload] = await Promise.all([
        configurationResponse.json().catch(() => null),
        cardsResponse.json().catch(() => null),
      ]);
      if (!configurationResponse.ok || !configurationPayload?.data) {
        throw new Error(formatError(configurationPayload, "投放配置加载失败。"));
      }
      if (!cardsResponse.ok || !cardsPayload?.data) {
        throw new Error(formatError(cardsPayload, "工作台卡片配置加载失败。"));
      }
      const configurationData = configurationPayload.data as ConfigurationPayload;
      const workbenchData = cardsPayload.data as Partial<MarketingWorkbenchConfig> & {
        canConfigure?: boolean;
        options?: { roles?: SelectOption[]; memberships?: SelectOption[] } | null;
      };
      setData({
        ...configurationData,
        // Role and employee lists come from the workbench endpoint because
        // they are only needed by people allowed to configure card audiences.
        roles: workbenchData.options?.roles ?? [],
        memberships: workbenchData.options?.memberships ?? [],
      });
      setCards({ cards: Array.isArray(workbenchData.cards) ? workbenchData.cards : [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "投放配置加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const directMetrics = useMemo(
    () => (data?.metrics ?? []).filter((metric) => metric.calculation === "DIRECT" && metric.isActive),
    [data],
  );

  async function saveItem(payload: Record<string, unknown>, successMessage: string, reset: () => void) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/mvp/marketing/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(formatError(result, "保存失败，请检查填写内容。"));
      reset();
      setMessage(successMessage);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function saveCards() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/mvp/marketing/workbench-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cards),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(formatError(result, "工作台卡片保存失败，请检查引用和适用范围。"));
      setCards(result.data as MarketingWorkbenchConfig);
      setMessage("工作台卡片已保存。显示范围只影响界面，不会放宽数据权限。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "工作台卡片保存失败。");
    } finally {
      setSaving(false);
    }
  }

  function beginEditSource(source: MarketingSource) {
    setSourceForm({
      id: source.id,
      code: source.code,
      name: source.name,
      sourceKind: source.kind,
      parentId: source.parentId ?? "",
      departmentId: source.departmentId ?? "",
      siteId: source.siteId ?? "",
      sortOrder: source.sortOrder,
      isActive: source.isActive,
    });
    setActiveTab("sources");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginEditMetric(metric: MarketingMetric) {
    setMetricForm({
      id: metric.id,
      code: metric.code,
      name: metric.name,
      valueType: metric.valueType,
      aggregation: metric.aggregation,
      calculation: metric.calculation,
      numeratorMetricCode: metric.numeratorMetricCode ?? "",
      denominatorMetricCode: metric.denominatorMetricCode ?? "",
      multiplier: metric.multiplier ?? "100",
      inputRequired: metric.inputRequired,
      showOnWorkbench: metric.showOnWorkbench,
      description: metric.description ?? "",
      sortOrder: metric.sortOrder,
      isActive: metric.isActive,
    });
    setActiveTab("metrics");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginEditStatus(status: CreativeStatus) {
    setStatusForm({
      id: status.id,
      code: status.code,
      name: status.name,
      color: status.color ?? "#b88718",
      isTerminal: status.isTerminal,
      sortOrder: status.sortOrder,
      isActive: status.isActive,
    });
  }

  function beginEditTag(tag: MarketingTag) {
    setTagForm({
      id: tag.id,
      name: tag.name,
      color: tag.color ?? "#64748b",
      sortOrder: tag.sortOrder,
      isActive: tag.isActive,
    });
  }

  function updateCard(index: number, update: Partial<MarketingWorkbenchCard>) {
    setCards((current) => ({
      cards: current.cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...update } : card),
    }));
  }

  function updateCardAudience(index: number, field: keyof MarketingWorkbenchCardAudience, value: string[]) {
    const card = cards.cards[index];
    if (!card) return;
    updateCard(index, { audience: { ...card.audience, [field]: value } });
  }

  function changeCardKind(index: number, kind: MarketingWorkbenchCardKind) {
    const defaultMetric = data?.metrics.find((metric) => metric.isActive)?.code ?? null;
    const defaultQueue = queueOptions[0]?.value ?? null;
    const actionKey = "marketing.report.read";
    updateCard(index, {
      kind,
      metricCode: kind === "METRIC" ? defaultMetric : null,
      queueKey: kind === "QUEUE" ? defaultQueue : null,
      actionKey: kind === "QUICK_ACTION" ? actionKey : null,
      href: kind === "QUICK_ACTION" ? defaultHrefForAction(actionKey) : null,
    });
  }

  function addCard() {
    setCards((current) => {
      const label = "新的快捷入口";
      return {
        cards: [...current.cards, {
          key: cardKeyFromLabel(label, current.cards),
          kind: "QUICK_ACTION",
          label,
          description: "由拥有配置权限的人员维护。",
          isVisible: true,
          zone: "QUICK",
          sortOrder: (Math.max(0, ...current.cards.map((card) => card.sortOrder)) + 10),
          audience: { roleIds: [], departmentIds: [], membershipIds: [] },
          metricCode: null,
          queueKey: null,
          actionKey: "marketing.report.read",
          href: "/admin/marketing/reports",
        }],
      };
    });
  }

  if (loading && !data) {
    return (
      <section aria-busy="true" aria-label="正在加载投放配置" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-[#3a2b08] to-amber-800 px-5 py-6 text-white sm:px-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-200">投放运营 · 可配置基础</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">投放配置中心</h1>
          <p className="mt-2 text-sm text-amber-50/80">正在同步当前业务范围、权限与工作台卡片，请稍候。</p>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <LoaderCircle size={18} className="shrink-0 animate-spin" />
            <span><strong className="font-semibold">正在加载配置</strong><span className="ml-1 text-amber-800/80">首次进入可能需要数秒，不会影响已保存数据。</span></span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
            {tabItems.map((tab) => (
              <div key={tab.key} className="rounded-xl border border-slate-100 p-4">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-sm"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 shrink-0" size={20} /><div><h1 className="font-bold">无法打开投放配置</h1><p className="mt-1 text-sm">{error || "当前账号没有可用的投放配置范围。"}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-800"><RefreshCw size={15} />重试</button></div></div></section>;
  }

  const canConfigure = data.permissions.canConfigure;
  const roles = data.roles ?? [];
  const memberships = data.memberships ?? [];

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-slate-950 via-[#3a2b08] to-amber-800 p-6 text-white shadow-lg shadow-amber-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-amber-200">投放运营 · 可配置基础</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">投放配置中心</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/85">渠道、原始指标、素材分类和工作台入口都可按当前业务范围配置。卡片只决定展示；后台仍会按 Membership、Action 与 Scope 严格校验。</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新配置</button>
        </div>
      </header>

      {!canConfigure && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">当前账号只能查看，不能修改投放配置。请由拥有“投放工作台配置”权限的人员进行维护。</div>}
      {message && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${message.includes("失败") || message.includes("错误") || message.includes("不正确") ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</p>}

      <nav className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="投放配置分类">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex items-start gap-3 rounded-xl p-3 text-left transition ${selected ? "bg-amber-50 text-amber-950 ring-1 ring-amber-300" : "text-slate-600 hover:bg-slate-50"}`}><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-amber-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={17} /></span><span><strong className="block text-sm">{tab.label}</strong><small className="mt-0.5 block text-xs leading-5 text-slate-500">{tab.hint}</small></span></button>;
        })}
      </nav>

      {activeTab === "sources" && <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-700">可选来源</p><h2 className="mt-1 text-lg font-bold text-slate-950">{sourceForm.id ? "编辑渠道或来源" : "新增渠道或来源"}</h2><p className="mt-1 text-xs leading-5 text-slate-500">可用于日报、素材和后续投放数据归属。停用不会删除历史记录。</p></div><Layers3 className="text-amber-700" size={21} /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>来源名称 *</span><input value={sourceForm.name} onChange={(event) => setSourceForm((form) => ({ ...form, name: event.target.value }))} disabled={!canConfigure} maxLength={120} placeholder="如：欧洲账户 A" className="field" /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>来源编码 *</span><input value={sourceForm.code} onChange={(event) => setSourceForm((form) => ({ ...form, code: event.target.value }))} disabled={!canConfigure || Boolean(sourceForm.id)} maxLength={64} placeholder="如：EU_ACCOUNT_A" className="field font-mono" /><small className="text-[11px] text-slate-400">创建后编码不可随意变更，便于审计和导入。</small></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>来源类型</span><input value={sourceForm.sourceKind} onChange={(event) => setSourceForm((form) => ({ ...form, sourceKind: event.target.value }))} disabled={!canConfigure} maxLength={40} placeholder="如：CHANNEL / ACCOUNT" className="field" /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>上级来源</span><select value={sourceForm.parentId} onChange={(event) => setSourceForm((form) => ({ ...form, parentId: event.target.value }))} disabled={!canConfigure} className="field"><option value="">无上级</option>{data.sources.filter((item) => item.id !== sourceForm.id).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>归属部门</span><select value={sourceForm.departmentId} onChange={(event) => setSourceForm((form) => ({ ...form, departmentId: event.target.value }))} disabled={!canConfigure} className="field"><option value="">不限制部门</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>归属站点</span><select value={sourceForm.siteId} onChange={(event) => setSourceForm((form) => ({ ...form, siteId: event.target.value }))} disabled={!canConfigure} className="field"><option value="">不限制站点</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序</span><input type="number" min={0} max={100000} value={sourceForm.sortOrder} onChange={(event) => setSourceForm((form) => ({ ...form, sortOrder: Number(event.target.value) || 0 }))} disabled={!canConfigure} className="field" /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={sourceForm.isActive} onChange={(event) => setSourceForm((form) => ({ ...form, isActive: event.target.checked }))} disabled={!canConfigure} />启用此来源</label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!canConfigure || saving} onClick={() => void saveItem({ kind: "source", ...sourceForm, parentId: sourceForm.parentId || null, departmentId: sourceForm.departmentId || null, siteId: sourceForm.siteId || null }, sourceForm.id ? "来源已更新。" : "来源已创建。", () => setSourceForm(emptySource()))} className="primary-button"><Save size={16} />{saving ? "保存中…" : sourceForm.id ? "保存修改" : "新增来源"}</button>{sourceForm.id && <button type="button" onClick={() => setSourceForm(emptySource())} className="secondary-button">取消编辑</button>}</div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">已配置来源</h2><p className="mt-1 text-xs text-slate-500">{data.sources.length} 个来源，按显示顺序排列。</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{data.sources.filter((source) => source.isActive).length} 已启用</span></div>{data.sources.length ? <div className="divide-y divide-slate-100">{data.sources.map((source) => <div key={source.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{source.name}</strong><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${source.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{source.isActive ? "启用" : "停用"}</span></div><p className="mt-1 truncate font-mono text-xs text-slate-500">{source.code} · {source.kind}</p></div><button type="button" onClick={() => beginEditSource(source)} disabled={!canConfigure} className="text-xs font-semibold text-amber-800 hover:text-amber-950 disabled:text-slate-300">编辑</button></div>)}</div> : <EmptyState text="还没有渠道或来源。先在左侧新增一个，日报和素材即可按来源归档。" />}</article>
      </section>}

      {activeTab === "metrics" && <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-700">数据口径</p><h2 className="mt-1 text-lg font-bold text-slate-950">{metricForm.id ? "编辑日报指标" : "新增日报指标"}</h2><p className="mt-1 text-xs leading-5 text-slate-500">金额以最小货币单位保存；比率指标只可由原始事实自动计算，不能由员工手填。</p></div><BarChart3 className="text-amber-700" size={21} /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>指标名称 *</span><input value={metricForm.name} onChange={(event) => setMetricForm((form) => ({ ...form, name: event.target.value }))} disabled={!canConfigure} maxLength={120} placeholder="如：花费、转化数、CPA" className="field" /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>指标编码 *</span><input value={metricForm.code} onChange={(event) => setMetricForm((form) => ({ ...form, code: event.target.value }))} disabled={!canConfigure || Boolean(metricForm.id)} maxLength={64} placeholder="如：SPEND" className="field font-mono" /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>数值类型</span><select value={metricForm.valueType} onChange={(event) => setMetricForm((form) => ({ ...form, valueType: event.target.value as MetricForm["valueType"] }))} disabled={!canConfigure} className="field"><option value="COUNT">数量</option><option value="MONEY_CENTS">金额</option><option value="DECIMAL">小数</option><option value="PERCENT">百分比</option></select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>汇总方式</span><select value={metricForm.aggregation} onChange={(event) => setMetricForm((form) => ({ ...form, aggregation: event.target.value as MetricForm["aggregation"] }))} disabled={!canConfigure} className="field"><option value="SUM">求和</option><option value="AVG">平均</option><option value="LAST">取最新</option></select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>指标来源</span><select value={metricForm.calculation} onChange={(event) => setMetricForm((form) => ({ ...form, calculation: event.target.value as MetricForm["calculation"] }))} disabled={!canConfigure} className="field"><option value="DIRECT">员工录入的原始数据</option><option value="RATIO">系统计算的比例</option></select></label>
            <label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序</span><input type="number" min={0} max={100000} value={metricForm.sortOrder} onChange={(event) => setMetricForm((form) => ({ ...form, sortOrder: Number(event.target.value) || 0 }))} disabled={!canConfigure} className="field" /></label>
          </div>
          {metricForm.calculation === "RATIO" && <div className="mt-3 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium text-amber-950"><span>分子</span><select value={metricForm.numeratorMetricCode} onChange={(event) => setMetricForm((form) => ({ ...form, numeratorMetricCode: event.target.value }))} disabled={!canConfigure} className="field"><option value="">请选择</option>{directMetrics.map((metric) => <option key={metric.id} value={metric.code}>{metric.name}（{metric.code}）</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-amber-950"><span>分母</span><select value={metricForm.denominatorMetricCode} onChange={(event) => setMetricForm((form) => ({ ...form, denominatorMetricCode: event.target.value }))} disabled={!canConfigure} className="field"><option value="">请选择</option>{directMetrics.map((metric) => <option key={metric.id} value={metric.code}>{metric.name}（{metric.code}）</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-amber-950"><span>乘数</span><input value={metricForm.multiplier} onChange={(event) => setMetricForm((form) => ({ ...form, multiplier: event.target.value }))} disabled={!canConfigure} placeholder="如 100" className="field" /></label><p className="sm:col-span-3 text-xs leading-5 text-amber-900">例如：CPA = 花费 ÷ 转化数；CTR = 点击 ÷ 展示 × 100。系统会拒绝循环、失效或派生指标引用。</p></div>}
          <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600"><span>说明</span><textarea value={metricForm.description} onChange={(event) => setMetricForm((form) => ({ ...form, description: event.target.value }))} disabled={!canConfigure} maxLength={500} rows={2} placeholder="向员工说明统计口径或填报要求" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100" /></label>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={metricForm.inputRequired} disabled={!canConfigure || metricForm.calculation === "RATIO"} onChange={(event) => setMetricForm((form) => ({ ...form, inputRequired: event.target.checked }))} />日报必填</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={metricForm.showOnWorkbench} disabled={!canConfigure} onChange={(event) => setMetricForm((form) => ({ ...form, showOnWorkbench: event.target.checked }))} />在工作台推荐显示</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={metricForm.isActive} disabled={!canConfigure} onChange={(event) => setMetricForm((form) => ({ ...form, isActive: event.target.checked }))} />启用此指标</label></div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!canConfigure || saving} onClick={() => void saveItem({ kind: "metric", ...metricForm, numeratorMetricCode: metricForm.calculation === "RATIO" ? metricForm.numeratorMetricCode || null : null, denominatorMetricCode: metricForm.calculation === "RATIO" ? metricForm.denominatorMetricCode || null : null, multiplier: metricForm.calculation === "RATIO" ? metricForm.multiplier : null }, metricForm.id ? "指标已更新。" : "指标已创建。", () => setMetricForm(emptyMetric()))} className="primary-button"><Save size={16} />{saving ? "保存中…" : metricForm.id ? "保存修改" : "新增指标"}</button>{metricForm.id && <button type="button" onClick={() => setMetricForm(emptyMetric())} className="secondary-button">取消编辑</button>}</div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">日报指标清单</h2><p className="mt-1 text-xs text-slate-500">原始指标与比例指标分开管理，避免误填与错误平均。</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{data.metrics.length} 项</span></div>{data.metrics.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-medium">指标</th><th className="px-4 py-3 font-medium">口径</th><th className="px-4 py-3 font-medium">填报</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{data.metrics.map((metric) => <tr key={metric.id}><td className="px-4 py-3"><strong className="block text-slate-900">{metric.name}</strong><code className="text-xs text-slate-500">{metric.code}</code></td><td className="px-4 py-3 text-xs text-slate-600">{metric.calculation === "DIRECT" ? "原始录入" : `${metric.numeratorMetricCode} ÷ ${metric.denominatorMetricCode}${metric.multiplier && metric.multiplier !== "1" ? ` × ${metric.multiplier}` : ""}`}</td><td className="px-4 py-3 text-xs text-slate-600">{metric.calculation === "RATIO" ? "系统计算" : metric.inputRequired ? "必填" : "可选"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${metric.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{metric.isActive ? "启用" : "停用"}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => beginEditMetric(metric)} disabled={!canConfigure} className="text-xs font-semibold text-amber-800 hover:text-amber-950 disabled:text-slate-300">编辑</button></td></tr>)}</tbody></table></div> : <EmptyState text="还没有日报指标。建议先新增花费、展示、点击、转化等原始指标，再新增 CPA、CTR 等系统计算指标。" />}</article>
      </section>}

      {activeTab === "creative" && <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-700">素材生命周期</p><h2 className="mt-1 text-lg font-bold text-slate-950">素材状态</h2><p className="mt-1 text-xs leading-5 text-slate-500">例如待测试、投放中、已淘汰。终态素材仍可查询，但不会误当作进行中。</p></div><Palette className="text-amber-700" size={21} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-slate-600"><span>状态名称 *</span><input value={statusForm.name} onChange={(event) => setStatusForm((form) => ({ ...form, name: event.target.value }))} disabled={!canConfigure} className="field" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>状态编码 *</span><input value={statusForm.code} onChange={(event) => setStatusForm((form) => ({ ...form, code: event.target.value }))} disabled={!canConfigure || Boolean(statusForm.id)} className="field font-mono" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>颜色</span><input type="color" value={statusForm.color || "#b88718"} onChange={(event) => setStatusForm((form) => ({ ...form, color: event.target.value }))} disabled={!canConfigure} className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序</span><input type="number" min={0} max={100000} value={statusForm.sortOrder} onChange={(event) => setStatusForm((form) => ({ ...form, sortOrder: Number(event.target.value) || 0 }))} disabled={!canConfigure} className="field" /></label></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={statusForm.isTerminal} onChange={(event) => setStatusForm((form) => ({ ...form, isTerminal: event.target.checked }))} disabled={!canConfigure} />这是终态</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={statusForm.isActive} onChange={(event) => setStatusForm((form) => ({ ...form, isActive: event.target.checked }))} disabled={!canConfigure} />启用此状态</label></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!canConfigure || saving} onClick={() => void saveItem({ kind: "creativeStatus", ...statusForm }, statusForm.id ? "素材状态已更新。" : "素材状态已创建。", () => setStatusForm(emptyStatus()))} className="primary-button"><Save size={16} />{statusForm.id ? "保存状态" : "新增状态"}</button>{statusForm.id && <button type="button" onClick={() => setStatusForm(emptyStatus())} className="secondary-button">取消编辑</button>}</div><div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">{data.statuses.map((status) => <div key={status.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="flex items-center gap-2 text-sm font-medium text-slate-800"><i className="size-2.5 rounded-full" style={{ backgroundColor: status.color ?? "#94a3b8" }} />{status.name}{status.isTerminal && <small className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">终态</small>}</span><button type="button" onClick={() => beginEditStatus(status)} disabled={!canConfigure} className="text-xs font-semibold text-amber-800 hover:text-amber-950 disabled:text-slate-300">编辑</button></div>)}{!data.statuses.length && <p className="px-3 py-5 text-center text-sm text-slate-500">暂无状态</p>}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-700">便捷检索</p><h2 className="mt-1 text-lg font-bold text-slate-950">素材标签</h2><p className="mt-1 text-xs leading-5 text-slate-500">标签可以跨素材复用，用于主题、语言、角度、表现形式或审核结论。</p></div><Tags className="text-amber-700" size={21} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2"><span>标签名称 *</span><input value={tagForm.name} onChange={(event) => setTagForm((form) => ({ ...form, name: event.target.value }))} disabled={!canConfigure} className="field" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>颜色</span><input type="color" value={tagForm.color || "#64748b"} onChange={(event) => setTagForm((form) => ({ ...form, color: event.target.value }))} disabled={!canConfigure} className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序</span><input type="number" min={0} max={100000} value={tagForm.sortOrder} onChange={(event) => setTagForm((form) => ({ ...form, sortOrder: Number(event.target.value) || 0 }))} disabled={!canConfigure} className="field" /></label><label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={tagForm.isActive} onChange={(event) => setTagForm((form) => ({ ...form, isActive: event.target.checked }))} disabled={!canConfigure} />启用此标签</label></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!canConfigure || saving} onClick={() => void saveItem({ kind: "tag", ...tagForm }, tagForm.id ? "素材标签已更新。" : "素材标签已创建。", () => setTagForm(emptyTag()))} className="primary-button"><Save size={16} />{tagForm.id ? "保存标签" : "新增标签"}</button>{tagForm.id && <button type="button" onClick={() => setTagForm(emptyTag())} className="secondary-button">取消编辑</button>}</div><div className="mt-5 flex flex-wrap gap-2">{data.tags.map((tag) => <button key={tag.id} type="button" onClick={() => beginEditTag(tag)} disabled={!canConfigure} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-default"><i className="size-2 rounded-full" style={{ backgroundColor: tag.color ?? "#94a3b8" }} />{tag.name}{!tag.isActive && <small className="text-[10px] text-slate-400">已停用</small>}</button>)}{!data.tags.length && <p className="py-5 text-sm text-slate-500">暂无标签</p>}</div></article>
      </section>}

      {activeTab === "cards" && <section className="space-y-5">
        <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 shadow-sm"><div className="flex gap-3"><Settings2 className="mt-0.5 shrink-0 text-amber-700" size={19} /><div><strong>卡片只控制“看见什么、排在哪里、适用于谁”。</strong><p className="mt-1 text-xs leading-5">任何卡片都不会绕过后台数据权限。员工即使看到入口，服务端仍会校验当前 Membership、动作权限、数据范围以及有效协作授权。</p></div></div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold text-amber-700">布局与适用范围</p><h2 className="mt-1 text-lg font-bold text-slate-950">工作台卡片</h2><p className="mt-1 text-xs leading-5 text-slate-500">数字越小越靠前。所有人、部门、角色、员工的范围可组合使用，必须同时满足已填写的范围。</p></div><button type="button" disabled={!canConfigure} onClick={addCard} className="secondary-button"><Plus size={16} />新增卡片</button></div>
          <div className="mt-4 space-y-4">{cards.cards.map((card, index) => <article key={card.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{card.label || "未命名卡片"}</p><code className="mt-1 block text-xs text-slate-400">{card.key}</code></div><div className="flex flex-wrap items-center gap-3"><label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={card.isVisible} disabled={!canConfigure} onChange={(event) => updateCard(index, { isVisible: event.target.checked })} />{card.isVisible ? <Eye size={15} className="text-emerald-600" /> : <EyeOff size={15} className="text-slate-400" />}显示</label><button type="button" disabled={!canConfigure} onClick={() => setCards((current) => ({ cards: current.cards.filter((_, itemIndex) => itemIndex !== index) }))} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" aria-label={`移除${card.label || "卡片"}`}><Trash2 size={16} /></button></div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="grid gap-1 text-xs font-medium text-slate-600"><span>卡片标题</span><input value={card.label} maxLength={60} disabled={!canConfigure} onChange={(event) => updateCard(index, { label: event.target.value })} className="field" /></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>卡片类型</span><select value={card.kind} disabled={!canConfigure} onChange={(event) => changeCardKind(index, event.target.value as MarketingWorkbenchCardKind)} className="field"><option value="QUICK_ACTION">快捷入口</option><option value="QUEUE">待办队列</option><option value="METRIC">统计指标</option></select></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示位置</span><select value={card.zone} disabled={!canConfigure} onChange={(event) => updateCard(index, { zone: event.target.value as MarketingWorkbenchZone })} className="field"><option value="FOCUS">今日优先处理</option><option value="OVERVIEW">数据概览</option><option value="QUICK">常用入口</option></select></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>显示顺序</span><input type="number" min={0} max={10000} value={card.sortOrder} disabled={!canConfigure} onChange={(event) => updateCard(index, { sortOrder: Number(event.target.value) || 0 })} className="field" /></label></div>
            <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600"><span>说明</span><input value={card.description} maxLength={180} disabled={!canConfigure} onChange={(event) => updateCard(index, { description: event.target.value })} className="field" /></label>
            {card.kind === "METRIC" && <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600"><span>关联日报指标</span><select value={card.metricCode ?? ""} disabled={!canConfigure} onChange={(event) => updateCard(index, { metricCode: event.target.value || null })} className="field"><option value="">请选择指标</option>{data.metrics.filter((metric) => metric.isActive).map((metric) => <option key={metric.id} value={metric.code}>{metric.name}（{metric.code}）</option>)}</select></label>}
            {card.kind === "QUEUE" && <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600"><span>关联待办</span><select value={card.queueKey ?? ""} disabled={!canConfigure} onChange={(event) => updateCard(index, { queueKey: event.target.value as MarketingWorkbenchCard["queueKey"] })} className="field"><option value="">请选择待办</option>{queueOptions.map((option) => <option key={option.value} value={option.value ?? ""}>{option.label}</option>)}</select><small className="text-[11px] text-slate-400">{queueOptions.find((item) => item.value === card.queueKey)?.description}</small></label>}
            {card.kind === "QUICK_ACTION" && <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-slate-600"><span>权限动作 Key</span><input value={card.actionKey ?? ""} disabled={!canConfigure} list="marketing-action-hints" onChange={(event) => updateCard(index, { actionKey: event.target.value || null, href: defaultHrefForAction(event.target.value) })} placeholder="如 marketing.report.read" className="field font-mono" /><datalist id="marketing-action-hints">{stableActionHints.map((action) => <option key={action} value={action} />)}</datalist><small className="text-[11px] text-slate-400">必须是系统已配置的动作；保存时后台会再次校验。</small></label><label className="grid gap-1 text-xs font-medium text-slate-600"><span>跳转地址</span><input value={card.href ?? ""} disabled={!canConfigure} onChange={(event) => updateCard(index, { href: event.target.value || null })} placeholder="/admin/marketing/reports" className="field font-mono" /><small className="text-[11px] text-slate-400">仅允许系统内 /admin 地址。</small></label></div>}
            <div className="mt-4 grid gap-3 md:grid-cols-3"><SelectScope label="适用部门" value={card.audience.departmentIds} options={data.departments} disabled={!canConfigure} onChange={(value) => updateCardAudience(index, "departmentIds", value)} /><SelectScope label="适用角色" value={card.audience.roleIds} options={roles} disabled={!canConfigure || roles.length === 0} onChange={(value) => updateCardAudience(index, "roleIds", value)} /><SelectScope label="适用员工" value={card.audience.membershipIds} options={memberships} disabled={!canConfigure || memberships.length === 0} onChange={(value) => updateCardAudience(index, "membershipIds", value)} /></div>
            {(!roles.length || !memberships.length) && <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500"><Users size={15} className="mt-0.5 shrink-0 text-slate-400" />当前接口尚未提供本业务板块的角色或员工选项，因此此处暂不可选；已配置的范围仍会被保留并由服务端验证。部门范围可立即使用。</p>}
          </article>)}{!cards.cards.length && <EmptyState text="当前没有工作台卡片。可新增统计指标、待办队列或系统内快捷入口。" />}</div>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={!canConfigure || saving} onClick={() => void saveCards()} className="primary-button"><Save size={16} />{saving ? "保存中…" : "保存工作台卡片"}</button><span className="text-xs text-slate-500">保存后当前业务板块内有权限的员工会按新的位置、顺序和适用范围看到卡片。</span></div>
        </article>
      </section>}
      <style jsx>{`
        .field {
          height: 40px;
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          padding: 0 12px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
        }
        .field:focus {
          border-color: #d39e25;
          box-shadow: 0 0 0 3px rgba(211, 158, 37, 0.16);
        }
        .field:disabled {
          cursor: not-allowed;
          background: #f8fafc;
          color: #94a3b8;
        }
        .primary-button, .secondary-button {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 12px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 700;
          transition: background .15s ease, border-color .15s ease, color .15s ease;
        }
        .primary-button {
          background: #a97012;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(169, 112, 18, 0.18);
        }
        .primary-button:hover { background: #87590e; }
        .secondary-button {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
        }
        .secondary-button:hover { border-color: #d39e25; background: #fffbeb; color: #87590e; }
        .primary-button:disabled, .secondary-button:disabled { cursor: not-allowed; opacity: .5; }
      `}</style>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-36 place-items-center px-6 text-center text-sm leading-6 text-slate-500"><span>{text}</span></div>;
}
