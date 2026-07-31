"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, ClipboardList, Clock3, MonitorCog, PackagePlus, RefreshCw, Settings2, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";

type Category = { id: string; code: string; name: string; description: string | null; isSoftware: boolean; isActive: boolean; sortOrder: number };
type Status = { id: string; code: string; name: string; color: string | null; isActive: boolean; isTerminal: boolean; sortOrder: number };
type LifecycleAction = {
  id: string;
  code: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string | null;
  fromStatus: { name: string } | null;
  toStatus: { name: string } | null;
  availableQuantityDelta: number;
  archiveAsset: boolean;
  requiresAssignee: boolean;
  isActive: boolean;
  sortOrder: number;
};
type Membership = { id: string; departmentId: string | null; siteId: string | null; name: string; username: string };
type Department = { id: string; code: string; name: string; parentId: string | null };
type Site = { id: string; code: string; name: string; departmentId: string | null };
type SoftwareProfile = {
  platform: string | null;
  accountIdentifier: string | null;
  accountIdentifierMasked: boolean;
  licenseType: string | null;
  seatsTotal: number | null;
  seatsUsed: number;
  autoRenewal: boolean;
  renewalCostCents: string | null;
  renewalCurrency: string;
  renewalCycle: string | null;
};
type ResourceRow = {
  id: string;
  resourceNo: string;
  name: string;
  departmentId: string | null;
  siteId: string | null;
  brandModel: string | null;
  serialNumber: string | null;
  ownership: string | null;
  location: string | null;
  quantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  currency: string;
  valueCents: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  note: string | null;
  assignedMembershipId: string | null;
  isActive: boolean;
  category: Category;
  status: Status;
  assignedMembership: { id: string; user: { username: string; fullName: string | null } } | null;
  softwareProfile: SoftwareProfile | null;
};
type ResourceDetail = ResourceRow & {
  lifecycleHistoryRestricted?: boolean;
  lifecycleEvents: Array<{
    id: string;
    occurredAt: string;
    note: string | null;
    availableQuantityBefore: number;
    availableQuantityAfter: number;
    lifecycleAction: { code: string; name: string };
    fromStatus: { id: string; name: string } | null;
    toStatus: { id: string; name: string } | null;
    performedByMembership: { user: { username: string; fullName: string | null } };
    fromAssigneeMembership: { user: { username: string; fullName: string | null } } | null;
    toAssigneeMembership: { user: { username: string; fullName: string | null } } | null;
  }>;
};
type Config = {
  categories: Category[];
  statuses: Status[];
  lifecycleActions: LifecycleAction[];
  departments: Department[];
  sites: Site[];
  memberships: Membership[];
  capabilities: {
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canLifecycle: boolean;
    canArchive: boolean;
    canManageSoftwareAccount: boolean;
    canConfigure: boolean;
  };
};
type ListResponse = {
  data: ResourceRow[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
  summary: { total: number; assigned: number; expiringSoon: number; lowStock: number };
};

const EMPTY_CONFIG: Config = {
  categories: [], statuses: [], lifecycleActions: [], departments: [], sites: [], memberships: [],
  capabilities: {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canLifecycle: false,
    canArchive: false,
    canManageSoftwareAccount: false,
    canConfigure: false,
  },
};
const EMPTY_LIST: ListResponse = { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 0 }, summary: { total: 0, assigned: 0, expiringSoon: 0, lowStock: 0 } };

function currency(cents: string | null, code: string) {
  if (!cents) return "—";
  const number = Number(cents);
  if (!Number.isFinite(number)) return `${cents} ${code}`;
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(number / 100);
}

function shortDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "—";
}

function personName(value: { username: string; fullName: string | null } | null | undefined) {
  return value?.fullName || value?.username || "未分配";
}

function selectClassName() {
  return "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
}

function inputClassName() {
  return "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100";
}

export default function ResourceCenterWorkbench({ softwareOnly = false }: { softwareOnly?: boolean }) {
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [list, setList] = useState<ListResponse>(EMPTY_LIST);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configEditorKey, setConfigEditorKey] = useState("");
  const [selected, setSelected] = useState<ResourceDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshConfig = useCallback(async () => {
    const response = await fetch("/api/mvp/resource-config", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "读取资源配置失败。");
    setConfig(payload.data);
    return payload.data as Config;
  }, []);

  const refreshList = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (statusId) params.set("statusId", statusId);
    if (departmentId) params.set("departmentId", departmentId);
    if (softwareOnly) params.set("softwareOnly", "true");
    const response = await fetch(`/api/mvp/resources?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "读取资源台账失败。");
    setList({ data: payload.data, meta: payload.meta, summary: payload.summary });
  }, [categoryId, departmentId, page, pageSize, q, softwareOnly, statusId]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshConfig(), refreshList()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源中心暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [refreshConfig, refreshList]);

  useEffect(() => {
    // Defer the first network refresh so this effect only subscribes to the
    // scheduled work instead of synchronously triggering a render cascade.
    const timer = window.setTimeout(() => { void refreshAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAll]);

  const visibleCategories = useMemo(
    () => config.categories.filter((item) => item.isActive && (!softwareOnly || item.isSoftware)),
    [config.categories, softwareOnly],
  );
  const defaultStatusId = useMemo(() => config.statuses.find((item) => item.isActive)?.id ?? "", [config.statuses]);

  async function submitResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedCategory = config.categories.find((item) => item.id === String(form.get("categoryId") || ""));
    const value = (key: string) => String(form.get(key) || "").trim();
    const number = (key: string, fallback = 0) => {
      const parsed = Number(form.get(key));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const data = {
      resourceNo: value("resourceNo") || null,
      name: value("name"),
      categoryId: value("categoryId"),
      statusId: value("statusId"),
      departmentId: value("departmentId") || null,
      siteId: value("siteId") || null,
      assignedMembershipId: value("assignedMembershipId") || null,
      brandModel: value("brandModel") || null,
      serialNumber: value("serialNumber") || null,
      ownership: value("ownership") || null,
      location: value("location") || null,
      quantity: number("quantity", 1),
      availableQuantity: number("availableQuantity", number("quantity", 1)),
      lowStockThreshold: number("lowStockThreshold", 0),
      currency: value("currency") || "CNY",
      valueCents: value("valueCents") || null,
      purchasedAt: value("purchasedAt") || null,
      expiresAt: value("expiresAt") || null,
      note: value("note") || null,
      software: selectedCategory?.isSoftware
        ? {
            platform: value("platform") || null,
            accountIdentifier: value("accountIdentifier") || null,
            licenseType: value("licenseType") || null,
            seatsTotal: value("seatsTotal") ? number("seatsTotal") : null,
            seatsUsed: value("seatsUsed") ? number("seatsUsed") : 0,
            autoRenewal: form.get("autoRenewal") === "on",
            renewalCostCents: value("renewalCostCents") || null,
            renewalCurrency: value("renewalCurrency") || value("currency") || "CNY",
            renewalCycle: value("renewalCycle") || null,
          }
        : null,
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mvp/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源创建失败。");
      event.currentTarget.reset();
      setShowCreate(false);
      setPage(1);
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源创建失败。");
    } finally {
      setSaving(false);
    }
  }

  async function loadDetail(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/mvp/resources/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源详情读取失败。");
      setSelected(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源详情读取失败。");
    }
  }

  async function applyLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const nextAssigneeMembershipId = String(form.get("nextAssigneeMembershipId") || "");
    const data = {
      lifecycleActionId: String(form.get("lifecycleActionId") || ""),
      note: String(form.get("note") || "").trim() || null,
      ...(nextAssigneeMembershipId === "__CLEAR__"
        ? { nextAssigneeMembershipId: null }
        : nextAssigneeMembershipId
          ? { nextAssigneeMembershipId }
          : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/resources/${selected.id}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源流转失败。");
      await loadDetail(selected.id);
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源流转失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    const number = (key: string, fallback: number) => {
      const parsed = Number(form.get(key));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const software = selected.category.isSoftware
      ? {
          platform: value("platform") || null,
          ...(config.capabilities.canManageSoftwareAccount && value("accountIdentifier")
            ? { accountIdentifier: value("accountIdentifier") }
            : {}),
          licenseType: value("licenseType") || null,
          seatsTotal: value("seatsTotal") ? number("seatsTotal", 0) : null,
          seatsUsed: value("seatsUsed") ? number("seatsUsed", 0) : 0,
          autoRenewal: form.get("autoRenewal") === "on",
          renewalCostCents: value("renewalCostCents") || null,
          renewalCycle: value("renewalCycle") || null,
        }
      : undefined;
    const data = {
      resourceNo: value("resourceNo") || null,
      name: value("name"),
      brandModel: value("brandModel") || null,
      serialNumber: value("serialNumber") || null,
      ownership: value("ownership") || null,
      location: value("location") || null,
      quantity: number("quantity", selected.quantity),
      availableQuantity: number("availableQuantity", selected.availableQuantity),
      lowStockThreshold: number("lowStockThreshold", selected.lowStockThreshold),
      currency: value("currency") || selected.currency,
      valueCents: value("valueCents") || null,
      purchasedAt: value("purchasedAt") || null,
      expiresAt: value("expiresAt") || null,
      note: value("note") || null,
      ...(software ? { software } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/resources/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源资料更新失败。");
      setShowEdit(false);
      await loadDetail(selected.id);
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源资料更新失败。");
    } finally {
      setSaving(false);
    }
  }

  async function archiveResource() {
    if (!selected || !window.confirm(`确认归档「${selected.name}」吗？历史记录会保留。`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/mvp/resources/${selected.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源归档失败。");
      setSelected(null);
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源归档失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind") || "category");
    const toInt = (key: string, fallback = 0) => {
      const parsed = Number(form.get(key));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const common = { kind, code: String(form.get("code") || "").trim(), name: String(form.get("name") || "").trim(), sortOrder: toInt("sortOrder") };
    const data = kind === "category"
      ? { ...common, description: String(form.get("description") || "").trim() || null, isSoftware: form.get("isSoftware") === "on" }
      : kind === "status"
        ? { ...common, color: String(form.get("color") || "").trim() || null, isTerminal: form.get("isTerminal") === "on" }
        : {
            ...common,
            kind: "lifecycleAction",
            fromStatusId: String(form.get("fromStatusId") || "") || null,
            toStatusId: String(form.get("toStatusId") || "") || null,
            availableQuantityDelta: toInt("availableQuantityDelta"),
            archiveAsset: form.get("archiveAsset") === "on",
            requiresAssignee: form.get("requiresAssignee") === "on",
          };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mvp/resource-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源配置保存失败。");
      event.currentTarget.reset();
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源配置保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function toggleConfig(kind: "category" | "status" | "lifecycleAction", id: string, isActive: boolean) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/resource-config/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, isActive: !isActive }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源配置更新失败。");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源配置更新失败。");
    } finally {
      setSaving(false);
    }
  }

  const configEditor = useMemo(() => {
    const [kind, id] = configEditorKey.split(":");
    if (!id) return null;
    if (kind === "category") {
      const row = config.categories.find((item) => item.id === id);
      return row ? { kind: "category" as const, row } : null;
    }
    if (kind === "status") {
      const row = config.statuses.find((item) => item.id === id);
      return row ? { kind: "status" as const, row } : null;
    }
    if (kind === "lifecycleAction") {
      const row = config.lifecycleActions.find((item) => item.id === id);
      return row ? { kind: "lifecycleAction" as const, row } : null;
    }
    return null;
  }, [config.categories, config.lifecycleActions, config.statuses, configEditorKey]);

  async function submitConfigPatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configEditor) return;
    const form = new FormData(event.currentTarget);
    const toInt = (key: string, fallback: number) => {
      const parsed = Number(form.get(key));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const common = {
      kind: configEditor.kind,
      name: String(form.get("name") || "").trim(),
      sortOrder: toInt("sortOrder", configEditor.row.sortOrder),
    };
    const data = configEditor.kind === "category"
      ? {
          ...common,
          description: String(form.get("description") || "").trim() || null,
          isSoftware: form.get("isSoftware") === "on",
        }
      : configEditor.kind === "status"
        ? {
            ...common,
            color: String(form.get("color") || "").trim() || null,
            isTerminal: form.get("isTerminal") === "on",
          }
        : {
            ...common,
            kind: "lifecycleAction" as const,
            fromStatusId: String(form.get("fromStatusId") || "") || null,
            toStatusId: String(form.get("toStatusId") || "") || null,
            availableQuantityDelta: toInt("availableQuantityDelta", configEditor.row.availableQuantityDelta),
            archiveAsset: form.get("archiveAsset") === "on",
            requiresAssignee: form.get("requiresAssignee") === "on",
          };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mvp/resource-config/${configEditor.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "资源配置更新失败。");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资源配置更新失败。");
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = softwareOnly ? "软件资产" : "资源中心";
  const pageDescription = softwareOnly
    ? "集中管理软件授权、账号标识、席位、到期与续费；不保存密码、Token 或完整许可证。"
    : "统一管理公司资源、使用归属、库存、到期与流转记录。分类、状态和流转动作均可由有权限的人配置。";
  const lifecycleActionsForSelected = selected
    ? config.lifecycleActions.filter((action) => action.isActive && (!action.fromStatusId || action.fromStatusId === selected.status.id))
    : [];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-amber-200 bg-[linear-gradient(125deg,#fffdf7_0%,#fff7df_45%,#ffffff_100%)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800"><MonitorCog className="size-4" /> 人事与行政 · 可配置台账</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{pageDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshAll()} disabled={loading}><RefreshCw className="size-4" />刷新</Button>
            {config.capabilities.canConfigure && <Button variant="outline" onClick={() => setShowConfig((value) => !value)}><Settings2 className="size-4" />资源配置</Button>}
            {config.capabilities.canCreate && <Button onClick={() => setShowCreate((value) => !value)}><PackagePlus className="size-4" />新建{softwareOnly ? "软件" : "资源"}</Button>}
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["资源总数", list.summary.total, ClipboardList, "text-slate-900", "border-slate-200 bg-white"],
          ["已分配", list.summary.assigned, UsersRound, "text-amber-800", "border-amber-200 bg-amber-50"],
          ["30天内到期", list.summary.expiringSoon, Clock3, "text-orange-800", "border-orange-200 bg-orange-50"],
          ["低库存 / 待补充", list.summary.lowStock, Archive, "text-rose-800", "border-rose-200 bg-rose-50"],
        ].map(([label, count, Icon, tone, box]) => {
          const CardIcon = Icon as typeof ClipboardList;
          return <div key={String(label)} className={`rounded-2xl border p-4 shadow-sm ${String(box)}`}><div className={`flex items-center gap-2 text-xs font-semibold ${String(tone)}`}><CardIcon className="size-4" />{String(label)}</div><p className={`mt-2 text-3xl font-bold ${String(tone)}`}>{String(count)}</p></div>;
        })}
      </section>

      {showCreate && <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">新建{softwareOnly ? "软件资产" : "资源"}</h2><p className="mt-1 text-xs text-slate-500">只填必要资料即可；编号为空时系统会生成内部编号。</p></div><Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>收起</Button></div>
        <form onSubmit={submitResource} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">资源名称 *<input className={inputClassName()} name="name" required placeholder="例如：MacBook Pro 14" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">资源编号<input className={inputClassName()} name="resourceNo" placeholder="可不填，自动生成" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">分类 *<select className={selectClassName()} name="categoryId" required defaultValue={visibleCategories[0]?.id ?? ""}>{visibleCategories.length ? visibleCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">请先配置分类</option>}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">状态 *<select className={selectClassName()} name="statusId" required defaultValue={defaultStatusId}>{config.statuses.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">使用部门<select className={selectClassName()} name="departmentId" defaultValue=""><option value="">未指定</option>{config.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">站点<select className={selectClassName()} name="siteId" defaultValue=""><option value="">未指定</option>{config.sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">领用员工<select className={selectClassName()} name="assignedMembershipId" defaultValue=""><option value="">暂不分配</option>{config.memberships.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.username}）</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">品牌 / 型号<input className={inputClassName()} name="brandModel" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">序列号 / SN<input className={inputClassName()} name="serialNumber" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">所有权<input className={inputClassName()} name="ownership" placeholder="公司自有 / 租赁 / 订阅" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">存放位置<input className={inputClassName()} name="location" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">总数量 *<input className={inputClassName()} name="quantity" type="number" min="1" defaultValue="1" required /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">可用数量<input className={inputClassName()} name="availableQuantity" type="number" min="0" defaultValue="1" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">低库存阈值<input className={inputClassName()} name="lowStockThreshold" type="number" min="0" defaultValue="0" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">币种 *<input className={inputClassName()} name="currency" defaultValue="CNY" maxLength={3} required /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">价值（分）<input className={inputClassName()} name="valueCents" inputMode="numeric" placeholder="例如 599900" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">购置日期<input className={inputClassName()} name="purchasedAt" type="date" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">到期日期<input className={inputClassName()} name="expiresAt" type="date" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">备注<textarea className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" name="note" placeholder="可记录购置说明、归属说明等；不要填写密码、Token 或完整许可证。" /></label>
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-bold text-sky-900">软件授权资料（仅软件分类填写）</p><p className="mt-1 text-xs text-sky-700">账号标识按单独权限登记或脱敏显示；系统不保存密码、Token、API Key 或完整许可证。</p><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="grid gap-1 text-xs font-medium text-slate-700">平台<input className={inputClassName()} name="platform" placeholder="例如 Lark" /></label>{config.capabilities.canManageSoftwareAccount && <label className="grid gap-1 text-xs font-medium text-slate-700">账号标识<input className={inputClassName()} name="accountIdentifier" placeholder="仅账号/邮箱，不填密码" /></label>}<label className="grid gap-1 text-xs font-medium text-slate-700">授权类型<input className={inputClassName()} name="licenseType" placeholder="团队版" /></label><label className="grid gap-1 text-xs font-medium text-slate-700">授权总数<input className={inputClassName()} name="seatsTotal" type="number" min="0" /></label><label className="grid gap-1 text-xs font-medium text-slate-700">已使用<input className={inputClassName()} name="seatsUsed" type="number" min="0" defaultValue="0" /></label><label className="grid gap-1 text-xs font-medium text-slate-700">续费费用（分）<input className={inputClassName()} name="renewalCostCents" inputMode="numeric" /></label><label className="grid gap-1 text-xs font-medium text-slate-700">续费周期<input className={inputClassName()} name="renewalCycle" placeholder="月付 / 年付" /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="autoRenewal" type="checkbox" />自动续费</label></div></div>
          <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit" disabled={saving || !visibleCategories.length || !defaultStatusId}>{saving ? "保存中…" : "保存资源台账"}</Button></div>
        </form>
      </section>}

      {showConfig && <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><h2 className="text-lg font-bold text-slate-950">资源配置</h2><p className="mt-1 text-xs text-slate-500">分类、状态和流转动作保存在当前业务板块；后续新增无需改代码。</p></div>
        <form onSubmit={submitConfig} className="grid gap-3 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">配置类型<select className={selectClassName()} name="kind" defaultValue="category"><option value="category">资源分类</option><option value="status">资源状态</option><option value="lifecycleAction">流转动作</option></select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">编码 *<input className={inputClassName()} name="code" required placeholder="例如 OFFICE_ASSET" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">名称 *<input className={inputClassName()} name="name" required /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">排序<input className={inputClassName()} name="sortOrder" type="number" defaultValue="0" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">来源状态<select className={selectClassName()} name="fromStatusId" defaultValue=""><option value="">任意状态</option>{config.statuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">目标状态<select className={selectClassName()} name="toStatusId" defaultValue=""><option value="">保持原状态</option>{config.statuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">可用数量变更<input className={inputClassName()} name="availableQuantityDelta" type="number" defaultValue="0" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">状态颜色<input className={inputClassName()} name="color" placeholder="amber" /></label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="isSoftware" type="checkbox" />分类属于软件</label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="isTerminal" type="checkbox" />状态为终态</label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="requiresAssignee" type="checkbox" />流转需要领用人</label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="archiveAsset" type="checkbox" />流转后归档资源</label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-3">分类说明<input className={inputClassName()} name="description" /></label>
          <div className="flex items-end"><Button type="submit" disabled={saving}>保存配置</Button></div>
        </form>
        <div className="mt-5 grid gap-3 lg:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">分类</p><div className="mt-2 flex flex-wrap gap-1">{config.categories.map((item) => <span key={item.id} className={`rounded-full px-2 py-1 text-xs ${item.isActive ? "bg-white text-slate-700 ring-1 ring-slate-200" : "bg-slate-200 text-slate-500"}`}>{item.name}{item.isSoftware ? " · 软件" : ""}</span>)}</div></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">状态</p><div className="mt-2 flex flex-wrap gap-1">{config.statuses.map((item) => <span key={item.id} className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{item.name}</span>)}</div></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">流转动作</p><div className="mt-2 space-y-1 text-xs text-slate-600">{config.lifecycleActions.map((item) => <div key={item.id}>{item.name}：{item.fromStatus?.name ?? "任意"} → {item.toStatus?.name ?? "保持"}</div>)}</div></div></div>
        {config.capabilities.canConfigure && <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-3"><div><p className="text-xs font-bold text-slate-700">维护分类</p><div className="mt-2 flex flex-wrap gap-1">{config.categories.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void toggleConfig("category", item.id, item.isActive)} className={`rounded-full px-2 py-1 text-xs ring-1 transition hover:ring-amber-400 disabled:opacity-50 ${item.isActive ? "bg-white text-slate-700 ring-slate-200" : "bg-slate-200 text-slate-500 ring-slate-300"}`}>{item.name} · {item.isActive ? "停用" : "启用"}</button>)}</div></div><div><p className="text-xs font-bold text-slate-700">维护状态</p><div className="mt-2 flex flex-wrap gap-1">{config.statuses.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void toggleConfig("status", item.id, item.isActive)} className={`rounded-full px-2 py-1 text-xs ring-1 transition hover:ring-amber-400 disabled:opacity-50 ${item.isActive ? "bg-white text-slate-700 ring-slate-200" : "bg-slate-200 text-slate-500 ring-slate-300"}`}>{item.name} · {item.isActive ? "停用" : "启用"}</button>)}</div></div><div><p className="text-xs font-bold text-slate-700">维护流转动作</p><div className="mt-2 flex flex-wrap gap-1">{config.lifecycleActions.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void toggleConfig("lifecycleAction", item.id, item.isActive)} className={`rounded-full px-2 py-1 text-xs ring-1 transition hover:ring-amber-400 disabled:opacity-50 ${item.isActive ? "bg-white text-slate-700 ring-slate-200" : "bg-slate-200 text-slate-500 ring-slate-300"}`}>{item.name} · {item.isActive ? "停用" : "启用"}</button>)}</div></div></div>}
        {config.capabilities.canConfigure && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-bold text-slate-950">编辑已有配置</p><p className="mt-1 text-xs text-slate-600">编码不可修改，避免历史台账与审计记录失去关联；名称、顺序、状态与流转规则可维护。</p></div>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">选择配置
              <select data-testid="resource-config-editor-picker" className={selectClassName()} value={configEditorKey} onChange={(event) => setConfigEditorKey(event.target.value)}>
                <option value="">请选择需要编辑的配置</option>
                <optgroup label="资源分类">{config.categories.map((item) => <option key={item.id} value={`category:${item.id}`}>{item.name}（{item.code}）</option>)}</optgroup>
                <optgroup label="资源状态">{config.statuses.map((item) => <option key={item.id} value={`status:${item.id}`}>{item.name}（{item.code}）</option>)}</optgroup>
                <optgroup label="流转动作">{config.lifecycleActions.map((item) => <option key={item.id} value={`lifecycleAction:${item.id}`}>{item.name}（{item.code}）</option>)}</optgroup>
              </select>
            </label>
          </div>
          {configEditor && <form key={configEditorKey} onSubmit={submitConfigPatch} className="mt-4 grid gap-3 border-t border-amber-200 pt-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">编码（固定）<input className={`${inputClassName()} bg-slate-100`} value={configEditor.row.code} disabled /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">名称 *<input className={inputClassName()} name="name" required defaultValue={configEditor.row.name} /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">排序<input className={inputClassName()} name="sortOrder" type="number" defaultValue={configEditor.row.sortOrder} /></label>
            {configEditor.kind === "category" && <><label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">分类说明<input className={inputClassName()} name="description" defaultValue={configEditor.row.description ?? ""} /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="isSoftware" type="checkbox" defaultChecked={configEditor.row.isSoftware} />软件专属分类</label></>}
            {configEditor.kind === "status" && <><label className="grid gap-1 text-xs font-semibold text-slate-700">状态颜色<input className={inputClassName()} name="color" defaultValue={configEditor.row.color ?? ""} placeholder="amber / emerald / slate" /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="isTerminal" type="checkbox" defaultChecked={configEditor.row.isTerminal} />终态（不再允许继续流转）</label></>}
            {configEditor.kind === "lifecycleAction" && <><label className="grid gap-1 text-xs font-semibold text-slate-700">来源状态<select className={selectClassName()} name="fromStatusId" defaultValue={configEditor.row.fromStatusId ?? ""}><option value="">任意状态</option>{config.statuses.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : "（已停用）"}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-700">目标状态<select className={selectClassName()} name="toStatusId" defaultValue={configEditor.row.toStatusId ?? ""}><option value="">保持原状态</option>{config.statuses.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : "（已停用）"}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-700">可用数量变更<input className={inputClassName()} name="availableQuantityDelta" type="number" defaultValue={configEditor.row.availableQuantityDelta} /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="requiresAssignee" type="checkbox" defaultChecked={configEditor.row.requiresAssignee} />必须指定领用人</label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="archiveAsset" type="checkbox" defaultChecked={configEditor.row.archiveAsset} />流转后归档资源</label></>}
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={saving}>保存配置修改</Button><Button type="button" variant="outline" onClick={() => setConfigEditorKey("")}>取消</Button></div>
          </form>}
        </div>}
      </section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(150px,.6fr))_auto]">
          <input className={inputClassName()} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="搜索资源编号、名称、型号、序列号、位置…" />
          <select className={selectClassName()} value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">全部分类</option>{visibleCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={selectClassName()} value={statusId} onChange={(event) => { setStatusId(event.target.value); setPage(1); }}><option value="">全部状态</option>{config.statuses.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={selectClassName()} value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1); }}><option value="">全部可见部门</option>{config.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Button variant="outline" onClick={() => { setQ(""); setCategoryId(""); setStatusId(""); setDepartmentId(""); setPage(1); }}>重置</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-semibold">资源编号</th><th className="px-4 py-3 font-semibold">名称 / 分类</th><th className="px-4 py-3 font-semibold">状态</th><th className="px-4 py-3 font-semibold">使用人</th><th className="px-4 py-3 font-semibold">数量</th><th className="px-4 py-3 font-semibold">到期日</th><th className="px-4 py-3 font-semibold">价值</th><th className="px-4 py-3 font-semibold">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">正在加载资源台账…</td></tr> : list.data.length ? list.data.map((row) => <tr key={row.id} className="hover:bg-amber-50/40"><td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{row.resourceNo}</td><td className="px-4 py-3"><p className="font-semibold text-slate-950">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.category.name}{row.brandModel ? ` · ${row.brandModel}` : ""}{row.softwareProfile?.platform ? ` · ${row.softwareProfile.platform}` : ""}</p></td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{row.status.name}</span></td><td className="px-4 py-3 text-slate-700">{personName(row.assignedMembership?.user)}</td><td className="px-4 py-3 text-slate-700">{row.availableQuantity} / {row.quantity}</td><td className="px-4 py-3 text-slate-700">{shortDate(row.expiresAt)}</td><td className="px-4 py-3 text-slate-700">{currency(row.valueCents, row.currency)}</td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => void loadDetail(row.id)}>查看与流转</Button></td></tr>) : <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-500">暂无符合条件的资源。{config.capabilities.canCreate ? "可点击“新建资源”开始登记。" : ""}</td></tr>}</tbody></table></div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>共 {list.meta.total} 条 · 第 {list.meta.page} / {Math.max(1, list.meta.pageCount)} 页</span><div className="flex items-center gap-2"><select className={selectClassName()} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 / 页</option><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft className="size-4" />上一页</Button><Button variant="outline" size="sm" disabled={page >= list.meta.pageCount} onClick={() => setPage((value) => value + 1)}>下一页<ArrowRight className="size-4" /></Button></div></div>
      </section>

      {selected && <section className="rounded-3xl border border-amber-300 bg-white p-5 shadow-lg"><div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">资源详情与流转</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{selected.name}</h2><p className="mt-1 font-mono text-xs text-slate-500">{selected.resourceNo} · {selected.category.name} · {selected.status.name}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setSelected(null); setShowEdit(false); }}>关闭</Button>{config.capabilities.canUpdate && selected.isActive && <Button variant="outline" size="sm" onClick={() => setShowEdit((value) => !value)}>编辑资料</Button>}{config.capabilities.canArchive && selected.isActive && <Button variant="destructive" size="sm" onClick={() => void archiveResource()} disabled={saving}>归档</Button>}</div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">领用员工</p><p className="mt-1 font-semibold text-slate-900">{personName(selected.assignedMembership?.user)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">数量</p><p className="mt-1 font-semibold text-slate-900">{selected.availableQuantity} / {selected.quantity}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">到期日</p><p className="mt-1 font-semibold text-slate-900">{shortDate(selected.expiresAt)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">位置</p><p className="mt-1 font-semibold text-slate-900">{selected.location || "未填写"}</p></div></div>
        {selected.softwareProfile && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm"><p className="font-bold text-sky-950">软件授权</p><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><span>平台：{selected.softwareProfile.platform || "—"}</span><span>账号标识：{selected.softwareProfile.accountIdentifier || "—"}{selected.softwareProfile.accountIdentifierMasked ? "（已脱敏）" : ""}</span><span>授权类型：{selected.softwareProfile.licenseType || "—"}</span><span>席位：{selected.softwareProfile.seatsUsed} / {selected.softwareProfile.seatsTotal ?? "—"}</span><span>自动续费：{selected.softwareProfile.autoRenewal ? "是" : "否"}</span><span>续费周期：{selected.softwareProfile.renewalCycle || "—"}</span><span>续费费用：{currency(selected.softwareProfile.renewalCostCents, selected.softwareProfile.renewalCurrency)}</span></div></div>}
        {showEdit && <form onSubmit={submitEdit} className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:grid-cols-2 xl:grid-cols-4"><div className="md:col-span-2 xl:col-span-4"><p className="text-sm font-bold text-slate-900">编辑资料</p><p className="mt-1 text-xs text-slate-600">状态、领用人和部门归属请通过下方“资源流转”变更；本次修改会写入审计记录。</p></div><label className="grid gap-1 text-xs font-semibold text-slate-700">资源编号<input className={inputClassName()} name="resourceNo" defaultValue={selected.resourceNo} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">资源名称 *<input className={inputClassName()} name="name" required defaultValue={selected.name} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">品牌 / 型号<input className={inputClassName()} name="brandModel" defaultValue={selected.brandModel ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">序列号 / S/N<input className={inputClassName()} name="serialNumber" defaultValue={selected.serialNumber ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">所有权<input className={inputClassName()} name="ownership" defaultValue={selected.ownership ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">存放位置<input className={inputClassName()} name="location" defaultValue={selected.location ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">总数量<input className={inputClassName()} name="quantity" type="number" min="1" required defaultValue={selected.quantity} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">可用数量<input className={inputClassName()} name="availableQuantity" type="number" min="0" required defaultValue={selected.availableQuantity} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">低库存阈值<input className={inputClassName()} name="lowStockThreshold" type="number" min="0" required defaultValue={selected.lowStockThreshold} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">币种<input className={inputClassName()} name="currency" maxLength={3} defaultValue={selected.currency} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">资产原值（分）<input className={inputClassName()} name="valueCents" inputMode="numeric" defaultValue={selected.valueCents ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">购置日期<input className={inputClassName()} name="purchasedAt" type="date" defaultValue={selected.purchasedAt?.slice(0, 10) ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">到期日期<input className={inputClassName()} name="expiresAt" type="date" defaultValue={selected.expiresAt?.slice(0, 10) ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">备注<textarea className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100" name="note" defaultValue={selected.note ?? ""} /></label>{selected.category.isSoftware && <div className="md:col-span-2 xl:col-span-4 grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 md:grid-cols-2 xl:grid-cols-4"><p className="md:col-span-2 xl:col-span-4 text-xs font-bold text-sky-900">软件授权资料：系统不保存密码、Token、API Key 或完整许可证。</p><label className="grid gap-1 text-xs font-semibold text-slate-700">平台<input className={inputClassName()} name="platform" defaultValue={selected.softwareProfile?.platform ?? ""} /></label>{config.capabilities.canManageSoftwareAccount && <label className="grid gap-1 text-xs font-semibold text-slate-700">账号标识<input className={inputClassName()} name="accountIdentifier" defaultValue={selected.softwareProfile?.accountIdentifierMasked ? "" : selected.softwareProfile?.accountIdentifier ?? ""} placeholder={selected.softwareProfile?.accountIdentifierMasked ? "留空不修改已脱敏账号" : "邮箱或账号标识"} /></label>}<label className="grid gap-1 text-xs font-semibold text-slate-700">授权类型<input className={inputClassName()} name="licenseType" defaultValue={selected.softwareProfile?.licenseType ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">授权总数<input className={inputClassName()} name="seatsTotal" type="number" min="0" defaultValue={selected.softwareProfile?.seatsTotal ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">已使用<input className={inputClassName()} name="seatsUsed" type="number" min="0" defaultValue={selected.softwareProfile?.seatsUsed ?? 0} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">续费费用（分）<input className={inputClassName()} name="renewalCostCents" inputMode="numeric" defaultValue={selected.softwareProfile?.renewalCostCents ?? ""} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">续费周期<input className={inputClassName()} name="renewalCycle" defaultValue={selected.softwareProfile?.renewalCycle ?? ""} /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input name="autoRenewal" type="checkbox" defaultChecked={selected.softwareProfile?.autoRenewal ?? false} />自动续费</label></div>}<div className="flex items-end gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={saving}>保存修改</Button><Button type="button" variant="outline" onClick={() => setShowEdit(false)}>取消</Button></div></form>}
        {config.capabilities.canLifecycle && selected.isActive && <form onSubmit={applyLifecycle} className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:grid-cols-[1fr_1fr_2fr_auto]"><label className="grid gap-1 text-xs font-semibold text-slate-700">流转动作<select className={selectClassName()} name="lifecycleActionId" required>{lifecycleActionsForSelected.length ? lifecycleActionsForSelected.map((item) => <option key={item.id} value={item.id}>{item.name}{item.availableQuantityDelta ? `（可用数 ${item.availableQuantityDelta > 0 ? "+" : ""}${item.availableQuantityDelta}）` : ""}</option>) : <option value="">暂无适用动作</option>}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-700">下一位领用人<select className={selectClassName()} name="nextAssigneeMembershipId" defaultValue=""><option value="">保持当前领用人</option><option value="__CLEAR__">取消分配</option>{config.memberships.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-700">处理备注<input className={inputClassName()} name="note" placeholder="例如：已交接给行政同事" /></label><div className="flex items-end"><Button type="submit" disabled={saving || !lifecycleActionsForSelected.length}>确认流转</Button></div></form>}
        <div className="mt-5"><h3 className="text-sm font-bold text-slate-950">流转历史</h3>{selected.lifecycleHistoryRestricted && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">部分历史明细受权限限制，不会向当前范围外的人员泄露。</p>}<div className="mt-3 space-y-2">{selected.lifecycleEvents?.length ? selected.lifecycleEvents.map((event) => <div key={event.id} className="rounded-2xl border border-slate-200 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{event.lifecycleAction.name} · {event.fromStatus?.name ?? "—"} → {event.toStatus?.name ?? "—"}</p><span className="text-xs text-slate-500">{shortDate(event.occurredAt)} · {personName(event.performedByMembership.user)}</span></div><p className="mt-1 text-xs text-slate-600">可用数量：{event.availableQuantityBefore} → {event.availableQuantityAfter} · 交接：{personName(event.fromAssigneeMembership?.user)} → {personName(event.toAssigneeMembership?.user)}</p>{event.note && <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">{event.note}</p>}</div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">尚无可查看的流转记录。</p>}</div></div>
      </section>}
    </div>
  );
}
