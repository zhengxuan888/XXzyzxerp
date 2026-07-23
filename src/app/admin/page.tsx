import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveMembershipById } from "@/lib/auth";
import { getAllowedActionsForSession } from "@/lib/permission";
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

  const [myDrafts, pendingReview, pendingShipment, inTransit, needsAttention] = await Promise.all([
    prisma.order.count({ where: { ...unitWhere, ownedByMembershipId: membership.id, status: "DRAFT" } }),
    prisma.order.count({ where: { ...unitWhere, status: "SUBMITTED" } }),
    prisma.order.count({ where: { ...unitWhere, status: "WAITING_SHIPMENT" } }),
    prisma.shipment.count({ where: { ...unitWhere, status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } } }),
    prisma.shipment.count({ where: { ...unitWhere, workStatus: "NEEDS_ATTENTION" } }),
  ]);

  const workbench: WorkbenchItem[] = [
    {
      actionKey: "order.create",
      label: "录入订单",
      description: `我的草稿 ${myDrafts} 单`,
      href: "/admin/orders",
      count: myDrafts,
    },
    {
      actionKey: "order.review",
      label: "订单核单",
      description: "检查客户、商品、金额和收件信息",
      href: "/admin/orders?status=SUBMITTED",
      count: pendingReview,
      priority: pendingReview > 0,
    },
    {
      actionKey: "order.ship",
      label: "发货处理",
      description: "录入承运商和物流单号并确认出库",
      href: "/admin/orders?status=WAITING_SHIPMENT",
      count: pendingShipment,
      priority: pendingShipment > 0,
    },
    {
      actionKey: "shipment.read",
      label: "物流跟踪",
      description: "查看发货后的完整运输状态",
      href: "/admin/shipments?queue=in_transit",
      count: inTransit,
    },
    {
      actionKey: "shipment.track.update",
      label: "跟单售后",
      description: "处理异常、记录备注和安排下次跟进",
      href: "/admin/shipments?queue=needs_attention",
      count: needsAttention,
      priority: needsAttention > 0,
    },
  ];
  const visibleWorkbench = workbench.filter((item) => allowedActions.has(item.actionKey));

  const secondary = [
    { actionKey: "customer.read", label: "客户管理", href: "/admin/customers" },
    { actionKey: "product.read", label: "商品与 SKU", href: "/admin/products" },
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{membership.businessUnit?.name ?? "当前业务板块"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">我的工作台</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">根据当前岗位、有效权限和业务待办自动生成；切换业务上下文后，数据与菜单会同步隔离。</p>
      </header>

      {visibleWorkbench.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">核心工作流</h2>
              <p className="mt-1 text-xs text-slate-500">从录单到物流跟单，按待办数量优先处理。</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">实时待办</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleWorkbench.map((item, index) => (
              <Link
                key={item.actionKey}
                href={item.href}
                className={`group relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                  item.priority ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white hover:border-violet-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-xl text-xs font-black ${item.priority ? "bg-amber-500 text-white" : "bg-violet-50 text-violet-700 group-hover:bg-violet-600 group-hover:text-white"}`}>{index + 1}</span>
                    <h3 className="font-bold text-slate-900">{item.label}</h3>
                  </div>
                  <span className={`min-w-8 rounded-full px-2 py-1 text-center text-xs font-semibold ${
                    item.priority ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700"
                  }`}>
                    {item.count}
                  </span>
                </div>
                <p className="mt-3 pl-12 text-xs leading-5 text-slate-500">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded border border-gray-200 p-4 text-sm text-gray-500">当前岗位暂未配置业务工作台动作，请联系管理员配置角色权限。</p>
      )}

      {secondary.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">常用功能</h2>
          <div className="flex flex-wrap gap-2">
            {secondary.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
