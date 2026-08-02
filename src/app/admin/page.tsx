import Link from "next/link";
import { redirect } from "next/navigation";

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
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
        <span className="text-xs font-medium text-teal-700">仅显示当前权限范围</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item, index) => (
          <Link
            key={item.key}
            href={item.href}
            data-dashboard-card={item.key}
            className="group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:grid-cols-[52px_120px_minmax(0,1fr)_72px_90px]"
          >
            <span className={`grid size-7 place-items-center rounded text-xs font-bold ${item.priority ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{index + 1}</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:block">{item.priority ? "高优先级" : "常规任务"}</span>
            <span className="min-w-0"><strong className="block truncate text-sm text-slate-800">{item.label}</strong><small className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</small></span>
            <strong className="text-right text-sm text-slate-800">{item.count}</strong>
            <span className="hidden h-8 items-center justify-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-700 group-hover:border-teal-300 sm:inline-flex">开始处理</span>
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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold text-teal-700">{membership.businessUnit?.name ?? "当前业务板块"}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">我的工作台</h1><p className="mt-1 text-sm text-slate-500">聚合当前岗位的关键指标与待办任务，数据严格遵循权限范围。</p></div>
        <p className="text-xs text-slate-400">数据更新于当前页面访问时间</p>
      </header>

      <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-6" aria-label="工作台关键指标">
        {[
          ["我的草稿", myDrafts], ["待核订单", pendingReview], ["待发货", pendingShipment],
          ["运输中", inTransit], ["高优先级", highPriorityTodo], ["异常物流", needsAttention],
        ].map(([label, value], index) => <div key={String(label)} className={`px-4 py-3 ${index >= 2 ? "border-t border-slate-100 sm:border-t-0" : ""} ${index % 2 ? "border-l border-slate-100" : "sm:border-l"}`}><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-xl font-bold tabular-nums text-slate-950">{value}</strong></div>)}
      </section>

      {canConfigure.allowed && <DashboardWorkbenchSettings
        initial={workbenchConfig}
        roles={roleRows.map((row) => ({ id: row.role.id, name: row.role.name || row.role.code })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))}
        departments={departmentRows}
        memberships={membershipRows.map((row) => ({ id: row.id, name: row.user.fullName || row.user.username }))}
      />}

      <WorkbenchSection title="核心工作" description="优先完成当前岗位最重要的业务闭环。" items={coreWorkbench} />
      <WorkbenchSection title="业务概览" description="由有权限的人按角色、部门或员工配置展示。" items={overviewWorkbench} />
      {workbench.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">当前岗位暂未配置可见工作台卡片，请联系拥有工作台配置权限的管理员。</p>}

      {secondary.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-bold text-slate-900">常用功能</h2>
          <div className="flex flex-wrap gap-2">
            {secondary.map((item) => <Link key={item.href} href={item.href} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800">{item.label}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
