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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">权限范围内</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <Link
            key={item.key}
            href={item.href}
            data-dashboard-card={item.key}
            className={`group relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
              item.priority ? "border-amber-300 bg-amber-50/80" : "border-slate-200 bg-white hover:border-amber-300"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid size-9 place-items-center rounded-xl text-xs font-black ${item.priority ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-800 group-hover:bg-amber-700 group-hover:text-white"}`}>{index + 1}</span>
                <h3 className="font-bold text-slate-900">{item.label}</h3>
              </div>
              <span className={`min-w-8 rounded-full px-2 py-1 text-center text-xs font-semibold ${item.priority ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-700"}`}>{item.count}</span>
            </div>
            <p className="mt-3 pl-12 text-xs leading-5 text-slate-500">{item.description}</p>
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
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-[#3a2b08] to-amber-800 p-6 text-white shadow-lg shadow-amber-100 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">{membership.businessUnit?.name ?? "当前业务板块"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">我的工作台</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-50/80">根据当前业务上下文、岗位权限和数据范围展示需要处理的工作；数字不会混入未被授权的部门或员工数据。</p>
        <p className="mt-5 border-l-2 border-amber-300 pl-3 text-xs leading-5 text-amber-100">择优秀伙伴，选优质资源，创卓越服务。</p>
      </header>

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
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">常用功能</h2>
          <div className="flex flex-wrap gap-2">
            {secondary.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800">{item.label}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
