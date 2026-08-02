import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  FilePenLine,
  PackageCheck,
  Route,
  Sparkles,
  Truck,
} from "lucide-react";

import DashboardWorkbenchSettings from "@/components/admin/DashboardWorkbenchSettings";
import { getActiveMembershipById } from "@/lib/auth";
import {
  dashboardCardAppliesToMembership,
  getDashboardMetricDefinition,
  parseDashboardWorkbenchConfig,
  type DashboardCardZone,
  type DashboardMetricKey,
} from "@/lib/dashboard-workbench-config";
import { HIGH_PRIORITY_SHIPMENT_EVENTS } from "@/lib/logistics";
import { createOrderAccessPlan } from "@/lib/order-access";
import { getAllowedActionsForSession, checkPermission } from "@/lib/permission";
import { getMembershipAwareMenus } from "@/lib/permission-guard";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { createShipmentAccessPlan } from "@/lib/shipment-access";

type WorkbenchItem = {
  key: DashboardMetricKey;
  label: string;
  description: string;
  href: string;
  count: number;
  priority: boolean;
  sortOrder: number;
  zone: DashboardCardZone;
};

type DashboardConfigurationRows = [
  Array<{ role: { id: string; name: string; code: string } }>,
  Array<{ id: string; name: string }>,
  Array<{ id: string; user: { username: string; fullName: string | null } }>,
];

function WorkbenchSection({ title, description, items }: { title: string; description: string; items: WorkbenchItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface)] shadow-[var(--elevation-card)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"><Sparkles size={13} />仅显示当前权限范围</span>
      </div>
      <div className="divide-y divide-slate-100/90">
        {items.map((item, index) => (
          <Link
            key={item.key}
            href={item.href}
            data-dashboard-card={item.key}
            className="group relative grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition duration-200 hover:bg-white/80 sm:grid-cols-[44px_106px_minmax(0,1fr)_72px_92px]"
          >
            <span className={`grid size-8 place-items-center rounded-lg text-xs font-bold shadow-sm ${item.priority ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{index + 1}</span>
            <span className="hidden text-xs font-semibold text-slate-500 sm:block">{item.priority ? "优先处理" : "常规任务"}</span>
            <span className="min-w-0"><strong className="block truncate text-sm text-slate-800">{item.label}</strong><small className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</small></span>
            <strong className={`text-right text-base tabular-nums ${item.priority ? "text-rose-600" : "text-slate-800"}`}>{item.count}</strong>
            <span className="hidden h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-blue-700 shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-blue-200 group-hover:shadow-md sm:inline-flex">开始处理<ArrowUpRight size={13} /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function AdminHomePage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [
    actionKeys,
    menuMap,
    orderReadAccess,
    orderReviewAccess,
    orderShipmentAccess,
    shipmentReadAccess,
    shipmentTrackAccess,
    workbenchSetting,
    canConfigure,
  ] = await Promise.all([
    getAllowedActionsForSession({ userId: session.userId, membershipId: membership.id }),
    getMembershipAwareMenus({ userId: session.userId, membershipId: membership.id }),
    createOrderAccessPlan({ membership, actionKey: "order.read" }),
    createOrderAccessPlan({ membership, actionKey: "order.review" }),
    createOrderAccessPlan({ membership, actionKey: "order.ship" }),
    createShipmentAccessPlan({ membership, actionKey: "shipment.read" }),
    createShipmentAccessPlan({ membership, actionKey: "shipment.track.update" }),
    prisma.dashboardWorkbenchSetting.findUnique({ where: { businessUnitId: membership.businessUnitId } }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "dashboard.configure",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  const allowedActions = new Set(actionKeys);
  const workbenchConfig = parseDashboardWorkbenchConfig(workbenchSetting);

  const [myDrafts, pendingReview, pendingShipment, inTransit, needsAttention, highPriorityTodo, highPriorityOverdue] = await Promise.all([
    orderReadAccess.allowed
      ? prisma.order.count({ where: { AND: [orderReadAccess.where, { businessUnitId: membership.businessUnitId, ownedByMembershipId: membership.id, status: "DRAFT" }] } })
      : Promise.resolve(0),
    orderReviewAccess.allowed
      ? prisma.order.count({ where: { AND: [orderReviewAccess.where, { businessUnitId: membership.businessUnitId, status: "SUBMITTED" }] } })
      : Promise.resolve(0),
    orderShipmentAccess.allowed
      ? prisma.order.count({ where: { AND: [orderShipmentAccess.where, { businessUnitId: membership.businessUnitId, status: "WAITING_SHIPMENT" }] } })
      : Promise.resolve(0),
    shipmentReadAccess.allowed
      ? prisma.shipment.count({ where: { AND: [shipmentReadAccess.where, { businessUnitId: membership.businessUnitId, status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } }] } })
      : Promise.resolve(0),
    shipmentTrackAccess.allowed
      ? prisma.shipment.count({ where: { AND: [shipmentTrackAccess.where, { businessUnitId: membership.businessUnitId, workStatus: "NEEDS_ATTENTION" }] } })
      : Promise.resolve(0),
    shipmentTrackAccess.allowed
      ? prisma.shipment.count({ where: { AND: [shipmentTrackAccess.where, { businessUnitId: membership.businessUnitId, events: { some: { eventType: { in: HIGH_PRIORITY_SHIPMENT_EVENTS } } } }] } })
      : Promise.resolve(0),
    shipmentTrackAccess.allowed
      ? prisma.shipment.count({ where: { AND: [shipmentTrackAccess.where, { businessUnitId: membership.businessUnitId, events: { some: { eventType: { in: HIGH_PRIORITY_SHIPMENT_EVENTS } } }, followUps: { some: { nextFollowUpAt: { not: null, lt: new Date() } } } }] } })
      : Promise.resolve(0),
  ]);

  const metricCounts: Record<DashboardMetricKey, number> = {
    order_drafts: myDrafts,
    order_review: pendingReview,
    waiting_shipment: pendingShipment,
    in_transit: inTransit,
    high_priority: highPriorityTodo,
    high_priority_overdue: highPriorityOverdue,
    needs_attention: needsAttention,
  };
  const workbench = workbenchConfig.cards
    .filter((card) => card.isVisible && dashboardCardAppliesToMembership(card, membership))
    .flatMap((card): WorkbenchItem[] => {
      const definition = getDashboardMetricDefinition(card.key);
      if (!definition || !allowedActions.has(definition.requiredActionKey)) return [];
      const count = metricCounts[card.key];
      return [{
        key: card.key,
        label: card.label,
        description: card.description,
        href: definition.href,
        count,
        priority: Boolean(definition.priorityWhenPositive && count > 0),
        sortOrder: card.sortOrder,
        zone: card.zone,
      }];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));
  const coreWorkbench = workbench.filter((item) => item.zone === "CORE");
  const overviewWorkbench = workbench.filter((item) => item.zone === "OVERVIEW");

  const secondary = [...menuMap.values()]
    .flat()
    .map((item) => {
      const condition = item.requiredCondition && typeof item.requiredCondition === "object"
        ? item.requiredCondition as { dashboardShortcut?: boolean; shortcutOrder?: number }
        : null;
      return { label: item.label, href: item.path, enabled: condition?.dashboardShortcut === true, order: condition?.shortcutOrder ?? 999 };
    })
    .filter((item) => item.enabled && item.href !== "/admin")
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const configurationOptions: DashboardConfigurationRows = canConfigure.allowed
    ? await Promise.all([
      prisma.membership.findMany({
        where: { businessUnitId: membership.businessUnitId, isActive: true },
        distinct: ["roleId"],
        select: { role: { select: { id: true, name: true, code: true } } },
      }),
      prisma.department.findMany({
        where: { businessUnitId: membership.businessUnitId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.membership.findMany({
        where: { businessUnitId: membership.businessUnitId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, user: { select: { username: true, fullName: true } } },
      }),
    ])
    : [[], [], []];
  const [roleRows, departmentRows, membershipRows] = configurationOptions;

  const summaryMetrics = [
    { label: "我的草稿", value: myDrafts, detail: "等待继续填写", icon: FilePenLine, tone: "blue" },
    { label: "待核订单", value: pendingReview, detail: "等待审核处理", icon: ClipboardCheck, tone: "violet" },
    { label: "待发货", value: pendingShipment, detail: "等待仓配出库", icon: PackageCheck, tone: "amber" },
    { label: "运输中", value: inTransit, detail: "正在履约途中", icon: Truck, tone: "emerald" },
    { label: "高优先级", value: highPriorityTodo, detail: "需要优先跟进", icon: AlertTriangle, tone: "rose" },
    { label: "异常物流", value: needsAttention, detail: "需要人工处理", icon: Route, tone: "cyan" },
  ] as const;
  const metricTone = {
    blue: "from-blue-50 to-white text-blue-700 ring-blue-100",
    violet: "from-violet-50 to-white text-violet-700 ring-violet-100",
    amber: "from-amber-50 to-white text-amber-700 ring-amber-100",
    emerald: "from-emerald-50 to-white text-emerald-700 ring-emerald-100",
    rose: "from-rose-50 to-white text-rose-700 ring-rose-100",
    cyan: "from-cyan-50 to-white text-cyan-700 ring-cyan-100",
  } as const;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">经营驾驶舱</h1><p className="mt-1.5 text-sm text-slate-500">聚合当前岗位的关键任务与业务状态，所有数据严格遵循你的权限范围。</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="rounded-md border border-amber-200/70 bg-amber-50/80 px-2.5 py-1 font-medium text-amber-800">{membership.businessUnit?.name ?? "当前业务板块"}</span><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,0.12)]" />数据实时更新</span></div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" aria-label="工作台关键指标">
        {summaryMetrics.map((metric) => {
          const Icon = metric.icon;
          return <article key={metric.label} className="group relative min-w-0 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-4 shadow-[var(--elevation-card)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white hover:shadow-[0_12px_34px_rgba(15,23,42,0.09)]">
            <div className="flex items-start justify-between gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-sm ring-1 ${metricTone[metric.tone]}`}><Icon size={19} strokeWidth={1.8} /></span><ArrowUpRight size={15} className="text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-500" /></div>
            <div className="mt-4 flex items-end justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500">{metric.label}</p><strong className="dashboard-number-reveal mt-1 block text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950">{metric.value}</strong></div></div>
            <p className="mt-3 truncate text-xs text-slate-400">{metric.detail}</p>
          </article>;
        })}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <WorkbenchSection title="今日重点" description="按优先级处理当前岗位最重要的业务闭环。" items={coreWorkbench} />
        <WorkbenchSection title="业务概览" description="由管理员按角色、部门或员工配置展示。" items={overviewWorkbench} />
      </div>
      {workbench.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">当前岗位暂未配置可见工作台卡片，请联系拥有工作台配置权限的管理员。</p>}

      {secondary.length > 0 && (
        <section className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-5 shadow-[var(--elevation-card)] backdrop-blur-xl">
          <h2 className="mb-3 font-bold text-slate-950">常用功能</h2>
          <div className="flex flex-wrap gap-2">
            {secondary.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md">{item.label}<ArrowUpRight size={13} /></Link>)}
          </div>
        </section>
      )}

      {canConfigure.allowed && <DashboardWorkbenchSettings
        initial={workbenchConfig}
        roles={roleRows.map((row) => ({ id: row.role.id, name: row.role.name || row.role.code })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))}
        departments={departmentRows}
        memberships={membershipRows.map((row) => ({ id: row.id, name: row.user.fullName || row.user.username }))}
      />}
    </div>
  );
}
