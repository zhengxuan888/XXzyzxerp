import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import LogisticsReturnImport from "@/components/admin/LogisticsReturnImport";
import LogisticsTemplateManager from "@/components/admin/LogisticsTemplateManager";
import { getActiveMembershipById } from "@/lib/auth";
import { createOrderAccessPlan } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

function templateSnapshotText(snapshot: unknown, key: string, fallback: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export default async function ShippingWorkbenchPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  // A shipment operator can be restricted to their department, department
  // tree, direct reports, site, or an explicit Access Grant. Compile the
  // predicate once so the waiting-shipment queue never fetches out-of-scope
  // orders and then tries to hide them in the UI.
  const [manualShipmentAccess, exportBatchAccess, templateRead, templateManage] = await Promise.all([
    createOrderAccessPlan({ membership, actionKey: "shipment.create" }),
    createOrderAccessPlan({ membership, actionKey: "logistics.export_batch.create" }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "logistics_template.read", targetBusinessUnitId: membership.businessUnitId }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "logistics_template.manage", targetBusinessUnitId: membership.businessUnitId }),
  ]);
  if (!manualShipmentAccess.allowed) redirect("/admin");

  const [rawOrders, logisticsTemplates, rawBatches] = await Promise.all([
    prisma.order.findMany({
      where: {
        AND: [
          { businessUnitId: membership.businessUnitId, status: "WAITING_SHIPMENT" },
          { OR: [manualShipmentAccess.where, exportBatchAccess.where] },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNo: true,
        departmentId: true,
        siteId: true,
        creatorUserId: true,
        ownedByMembershipId: true,
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
    prisma.logisticsProviderTemplate.findMany({
      where: { businessUnitId: membership.businessUnitId, archivedAt: null },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true, carrierName: true, version: true, isActive: true, configuration: true },
    }),
    prisma.logisticsExportBatch.findMany({
      where: { businessUnitId: membership.businessUnitId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
      select: {
        id: true,
        batchNo: true,
        departmentId: true,
        createdByMembershipId: true,
        templateVersion: true,
        templateSnapshot: true,
        status: true,
        createdAt: true,
        orderCount: true,
        artifacts: { where: { kind: "EXPORT_WORKBOOK" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
        returnImports: {
          orderBy: [{ previewedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            artifacts: { where: { kind: "RETURN_WORKBOOK" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const allowsOrder = (order: typeof rawOrders[number], access: typeof manualShipmentAccess) => access.allows({
    businessUnitId: membership.businessUnitId,
    departmentId: order.departmentId,
    siteId: order.siteId,
    ownerMembershipId: order.ownedByMembershipId,
  });
  const orders = rawOrders.filter((order) => allowsOrder(order, manualShipmentAccess));
  const exportCandidates = rawOrders
    .filter((order) => allowsOrder(order, exportBatchAccess) && !order.shipments[0]?.trackingNo)
    .map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      salesName: order.creatorUser.fullName || order.creatorUser.username,
      recipientName: order.recipientName,
      countryCode: order.recipientCountryCode,
      productSummary: order.items.map((item) => `${item.productName} × ${item.quantity}`).join(" / "),
    }));

  const batchesWithPermissions = await Promise.all(rawBatches.map(async (batch) => {
    const permissionInput = (actionKey: string) => checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey,
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: batch.departmentId,
      targetMembershipId: batch.createdByMembershipId,
    });
    const [read, preview, confirm, dispatch, artifact] = await Promise.all([
      permissionInput("logistics.export_batch.read"),
      permissionInput("logistics.return_import.preview"),
      permissionInput("logistics.return_import.confirm"),
      permissionInput("logistics.export_batch.dispatch"),
      permissionInput("logistics.batch_artifact.read"),
    ]);
    return {
      batch,
      read: read.allowed,
      canPreview: preview.allowed,
      canConfirm: confirm.allowed,
      canDispatch: dispatch.allowed,
      canDownload: artifact.allowed,
    };
  }));
  const batches = batchesWithPermissions.filter(({ read }) => read).map(({ batch, canPreview, canConfirm, canDispatch, canDownload }) => ({
    id: batch.id,
    batchNo: batch.batchNo,
    templateName: templateSnapshotText(batch.templateSnapshot, "name", "物流商模板"),
    templateVersion: batch.templateVersion,
    carrierName: templateSnapshotText(batch.templateSnapshot, "carrierName", "未命名承运商"),
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    orderCount: batch.orderCount,
    exportArtifactId: batch.artifacts[0]?.id ?? null,
    latestReturnArtifactId: batch.returnImports[0]?.artifacts[0]?.id ?? null,
    canPreview,
    canConfirm,
    canDispatch,
    canDownload,
  }));

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
  const waitingTrackingCount = orders.filter((item) => !item.shipments[0]?.trackingNo).length;
  const waitingConfirmationCount = orders.length - waitingTrackingCount;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-950">待发货工作台</h1>
        <p className="mt-1 text-sm text-slate-500">订单导出、物流单号回传、发货凭证和确认发货在这里依次完成。</p>
      </header>
      <section aria-label="发货流程" className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4">
        {[
          { step: "01", title: "导出订单", text: "选择订单和物流商模板", count: orders.length, tone: "text-slate-700 bg-slate-100" },
          { step: "02", title: "回传物流单号", text: "上传物流商回传表", count: waitingTrackingCount, tone: "text-amber-800 bg-amber-50" },
          { step: "03", title: "上传发货凭证", text: "进入订单上传图片或 PDF", count: waitingConfirmationCount, tone: "text-blue-800 bg-blue-50" },
          { step: "04", title: "确认发货", text: "完成后进入物流追踪", count: waitingConfirmationCount, tone: "text-emerald-800 bg-emerald-50" },
        ].map((item, index) => (
          <div key={item.step} className={`relative p-4 ${index ? "border-t border-slate-100 lg:border-l lg:border-t-0" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${item.tone}`}>{item.step}</span>
              <span className="text-xl font-bold tabular-nums text-slate-950">{item.count}</span>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.text}</p>
          </div>
        ))}
      </section>
      {templateRead.allowed && <LogisticsTemplateManager templates={logisticsTemplates} exportCandidates={exportCandidates} canManage={templateManage.allowed} canExport={exportCandidates.length > 0} />}
      <LogisticsReturnImport batches={batches} />
      <div id="shipping-confirmation" className="scroll-mt-24">
      <CrudPage
        apiBase="/api/mvp"
        resource="shipments"
        listTitle="待发货订单（回填运单号后上传凭证并确认发货）"
        createLabel="手动补录 / 更正"
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
          { key: "employee", label: "销售", render: (row) => {
            const creator = (row.order as { creatorUser?: { username?: string; fullName?: string | null } } | undefined)?.creatorUser;
            return creator?.fullName || creator?.username || "-";
          } },
          { key: "recipient", label: "收件人", render: (row) => (row.order as { recipientName?: string | null } | undefined)?.recipientName ?? "-" },
          { key: "country", label: "目的地", render: (row) => (row.order as { recipientCountryCode?: string | null } | undefined)?.recipientCountryCode ?? "-" },
          { key: "products", label: "商品", render: (row) => ((row.order as { items?: Array<{ productName: string; quantity: number }> } | undefined)?.items ?? []).map((item) => `${item.productName} × ${item.quantity}`).join("、") || "-" },
          { key: "trackingNo", label: "物流单号" },
          { key: "carrier", label: "物流商 / 运输方式" },
          { key: "status", label: "当前步骤", render: (row) => row.trackingNo ? "待上传凭证并确认发货" : "待回传物流单号" },
        ]}
      />
      </div>
    </div>
  );
}
