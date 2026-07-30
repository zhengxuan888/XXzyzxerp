import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import LogisticsReturnImport from "@/components/admin/LogisticsReturnImport";
import LogisticsTemplateManager from "@/components/admin/LogisticsTemplateManager";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function ShippingWorkbenchPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const permission = await checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "shipment.create", targetBusinessUnitId: membership.businessUnitId });
  if (!permission.allowed) redirect("/admin");

  const [rawOrders, logisticsTemplates, templateRead, templateManage, templateExport] = await Promise.all([
    prisma.order.findMany({
      where: { businessUnitId: membership.businessUnitId, status: "WAITING_SHIPMENT" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNo: true,
        departmentId: true,
        siteId: true,
        creatorUserId: true,
        recipientName: true,
        recipientCountryCode: true,
        creatorUser: { select: { username: true, fullName: true } },
        items: { select: { productName: true, quantity: true } },
        shipments: {
          where: { status: "PENDING" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, trackingNo: true, carrier: true, status: true, memo: true },
        },
      },
    }),
    prisma.logisticsProviderTemplate.findMany({ where: { businessUnitId: membership.businessUnitId }, orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true, carrierName: true, isActive: true, configuration: true } }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "logistics_template.read", targetBusinessUnitId: membership.businessUnitId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "logistics_template.manage", targetBusinessUnitId: membership.businessUnitId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "logistics_template.export", targetBusinessUnitId: membership.businessUnitId }),
  ]);
  const canProcess = (target: { departmentId: string | null; siteId: string | null; creatorUserId: string }) => checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: membership.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.creatorUserId,
  });
  const orderAccess = await Promise.all(rawOrders.map(canProcess));
  const orders = rawOrders.filter((_, index) => orderAccess[index].allowed);
  const workRows = orders.map((order) => {
    const shipment = order.shipments[0];
    return {
      id: order.id,
      order,
      trackingNo: shipment?.trackingNo ?? null,
      carrier: shipment?.carrier ?? null,
      status: shipment?.status ?? "PENDING",
      memo: shipment?.memo ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-950">待发货工作台</h1>
        <p className="mt-1 text-sm text-slate-500">先回填真实物流单号，再上传出货凭证并确认发货；只有确认发货后才进入物流追踪。</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">核单通过待处理</p><p className="mt-1 text-2xl font-bold text-slate-950">{orders.length}</p></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="text-xs text-amber-700">等待物流单号</p><p className="mt-1 text-2xl font-bold text-amber-900">{orders.filter((item) => !item.shipments[0]?.trackingNo).length}</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><p className="text-xs text-emerald-700">已回填待确认发货</p><p className="mt-1 text-2xl font-bold text-emerald-900">{orders.filter((item) => item.shipments[0]?.trackingNo).length}</p></div>
      </section>
      {templateRead.allowed && <LogisticsTemplateManager templates={logisticsTemplates} waitingOrderCount={orders.length} canManage={templateManage.allowed} canExport={templateExport.allowed} />}
      <LogisticsReturnImport />
      <CrudPage
        apiBase="/api/mvp"
        resource="shipments"
        listTitle="待发货订单（回填运单号后上传凭证并确认发货）"
        createLabel="手动回填运单号"
        detailPath="/admin/orders"
        canCreate
        canDelete={false}
        rows={workRows}
        createFields={[
          { key: "orderId", label: "已核单订单", required: true, type: "select", options: orders.map((order) => ({ value: order.id, label: order.orderNo })) },
          { key: "carrier", label: "物流商 / 运输方式", required: true },
          { key: "trackingNo", label: "物流单号", required: true },
          { key: "memo", label: "回填备注" },
        ]}
        dataColumns={[
          { key: "order", label: "订单号", render: (row) => (row.order as { orderNo?: string } | undefined)?.orderNo ?? "-" },
          { key: "employee", label: "录单员工", render: (row) => {
            const creator = (row.order as { creatorUser?: { username?: string; fullName?: string | null } } | undefined)?.creatorUser;
            return creator?.fullName || creator?.username || "-";
          } },
          { key: "recipient", label: "收件人", render: (row) => (row.order as { recipientName?: string | null } | undefined)?.recipientName ?? "-" },
          { key: "country", label: "目的地", render: (row) => (row.order as { recipientCountryCode?: string | null } | undefined)?.recipientCountryCode ?? "-" },
          { key: "products", label: "商品", render: (row) => ((row.order as { items?: Array<{ productName: string; quantity: number }> } | undefined)?.items ?? []).map((item) => `${item.productName} × ${item.quantity}`).join("、") || "-" },
          { key: "trackingNo", label: "物流单号" },
          { key: "carrier", label: "物流商 / 运输方式" },
          { key: "status", label: "发货状态" },
        ]}
      />
    </div>
  );
}
