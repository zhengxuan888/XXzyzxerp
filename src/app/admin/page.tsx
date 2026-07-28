import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveMembershipById } from "@/lib/auth";
import { getAllowedActionsForSession } from "@/lib/permission";
import { HIGH_PRIORITY_SHIPMENT_EVENTS } from "@/lib/logistics";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

type WorkbenchItem = {
  actionKey: string;
  label: string;
  description: string;
  href: string;
  count: number;
  priority?: boolean;
};

export default async function AdminHomePage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const allowedActions = new Set(
    await getAllowedActionsForSession({ userId: session.userId, membershipId: membership.id }),
  );
  const unitWhere = { businessUnitId: membership.businessUnitId };

  const [myDrafts, pendingReview, pendingShipment, inTransit, needsAttention, highPriorityTodo, highPriorityOverdue] = await Promise.all([
    prisma.order.count({ where: { ...unitWhere, ownedByMembershipId: membership.id, status: "DRAFT" } }),
    prisma.order.count({ where: { ...unitWhere, status: "SUBMITTED" } }),
    prisma.order.count({ where: { ...unitWhere, status: "WAITING_SHIPMENT" } }),
    prisma.shipment.count({ where: { ...unitWhere, status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } } }),
    prisma.shipment.count({ where: { ...unitWhere, workStatus: "NEEDS_ATTENTION" } }),
    prisma.shipment.count({
      where: {
        ...unitWhere,
        events: {
          some: { eventType: { in: HIGH_PRIORITY_SHIPMENT_EVENTS } },
        },
      },
    }),
    prisma.shipment.count({
      where: {
        ...unitWhere,
        events: {
          some: { eventType: { in: HIGH_PRIORITY_SHIPMENT_EVENTS } },
        },
        followUps: {
          some: {
            nextFollowUpAt: {
              not: null,
              lt: new Date(),
            },
          },
        },
      },
    }),
  ]);

  const workbench: WorkbenchItem[] = [
    {
      actionKey: "order.create",
      label: "录入订单",
      description: `有 ${myDrafts} 条可录入订单`,
      href: "/admin/orders",
      count: myDrafts,
    },
    {
      actionKey: "order.review",
      label: "订单核单",
      description: "处理待审核的订单基础信息",
      href: "/admin/orders?status=SUBMITTED",
      count: pendingReview,
      priority: pendingReview > 0,
    },
    {
      actionKey: "order.ship",
      label: "待发货处理",
      description: "处理待发货订单的物流提交与状态",
      href: "/admin/orders?status=WAITING_SHIPMENT",
      count: pendingShipment,
      priority: pendingShipment > 0,
    },
    {
      actionKey: "shipment.read",
      label: "物流追踪/跟单售后",
      description: "查看运输中订单的物流状态",
      href: "/admin/shipments?queue=in_transit",
      count: inTransit,
    },
    {
      actionKey: "shipment.track.update",
      label: "高优先级待办",
      description: "异常事件触发后的待处理任务",
      href: "/admin/shipments?queue=high_priority",
      count: highPriorityTodo,
      priority: highPriorityTodo > 0,
    },
    {
      actionKey: "shipment.track.update",
      label: "高优先级超期待办",
      description: "高优先级且已超期，建议立即处理",
      href: "/admin/shipments?queue=high_priority&overdue=1",
      count: highPriorityOverdue,
      priority: highPriorityOverdue > 0,
    },
    {
      actionKey: "shipment.track.update",
      label: "需要关注",
      description: "异常订单的待处理物流工单状态",
      href: "/admin/shipments?queue=needs_attention",
      count: needsAttention,
      priority: needsAttention > 0,
    },
  ];
  const visibleWorkbench = workbench.filter((item) => allowedActions.has(item.actionKey));

  const secondary = [
    { actionKey: "customer.read", label: "客户管理", href: "/admin/customers" },
    { actionKey: "product.read", label: "商品/SKU", href: "/admin/products" },
    { actionKey: "inventory.read", label: "库存查询", href: "/admin/inventory" },
    { actionKey: "expense.read", label: "费用记录", href: "/admin/expenses" },
    { actionKey: "approval.submit", label: "审批中心", href: "/admin/approvals" },
    { actionKey: "attendance.read", label: "考勤", href: "/admin/attendance" },
    { actionKey: "leave_request.read", label: "请假", href: "/admin/leave-requests" },
    { actionKey: "membership.read", label: "组织与员工", href: "/admin/memberships" },
    { actionKey: "role.read", label: "角色权限", href: "/admin/roles" },
  ].filter((item) => allowedActions.has(item.actionKey));

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-lg shadow-slate-200 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
          {membership.businessUnit?.name ?? "当前业务板块"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">我的工作台</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          依照权限自动展示可见工作区，并支持高优先级待办处理。
        </p>
        <p className="mt-5 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-amber-100">
          择优秀人才，选优质资源，做卓越服务。
        </p>
      </header>
      {visibleWorkbench.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">核心工作</h2>
              <p className="mt-1 text-xs text-slate-500">任务看板支持待办与异常快速处理。</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">重点处理</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleWorkbench.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                  item.priority ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white hover:border-violet-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid size-9 place-items-center rounded-xl text-xs font-black ${item.priority ? "bg-amber-500 text-white" : "bg-violet-50 text-violet-700 group-hover:bg-violet-600 group-hover:text-white"}`}
                    >
                      {index + 1}
                    </span>
                    <h3 className="font-bold text-slate-900">{item.label}</h3>
                  </div>
                  <span
                    className={`min-w-8 rounded-full px-2 py-1 text-center text-xs font-semibold ${
                      item.priority ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {item.count}
                  </span>
                </div>
                <p className="mt-3 pl-12 text-xs leading-5 text-slate-500">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded border border-gray-200 p-4 text-sm text-gray-500">
          当前岗位暂未配置工作台动作，请联系管理员配置角色权限。
        </p>
      )}

      {secondary.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">常用功能</h2>
          <div className="flex flex-wrap gap-2">
            {secondary.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
