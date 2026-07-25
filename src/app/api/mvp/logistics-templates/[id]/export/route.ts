import ExcelJS from "exceljs";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { type LogisticsExportField, parseLogisticsTemplateConfiguration } from "@/lib/logistics-provider-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type ExportOrder = Awaited<ReturnType<typeof loadOrders>>[number];

async function loadOrders(businessUnitId: string) {
  return prisma.order.findMany({
    where: { businessUnitId, status: "WAITING_SHIPMENT" },
    include: { items: { orderBy: { id: "asc" } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 5000,
  });
}

function fieldValue(order: ExportOrder, field: LogisticsExportField) {
  const values: Record<LogisticsExportField, string | number> = {
    orderNo: order.orderNo,
    recipientName: order.recipientName ?? "",
    recipientPhone: order.recipientPhone ?? "",
    recipientEmail: order.recipientEmail ?? "",
    recipientCountryCode: order.recipientCountryCode ?? "",
    recipientPostalCode: order.recipientPostalCode ?? "",
    recipientRegion: order.recipientRegion ?? "",
    recipientCity: order.recipientCity ?? "",
    recipientAddress: order.recipientAddress ?? "",
    productNames: order.items.map((item) => item.productName).join(" / "),
    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    codAmount: (order.codAmountCents / 100).toFixed(2),
    currency: order.currency,
    customerWhatsapp: order.customerWhatsapp ?? "",
    note: order.note ?? "",
  };
  return values[field];
}

export async function GET(request: NextRequest, context: RouteContext<"/api/mvp/logistics-templates/[id]/export">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "logistics_template.export",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "无权导出物流商订单。", 403);
  const { id } = await context.params;
  const template = await prisma.logisticsProviderTemplate.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId, isActive: true },
  });
  if (!template) return fail("TEMPLATE_NOT_FOUND", "物流商模板不存在或已停用。", 404);
  const configuration = parseLogisticsTemplateConfiguration(template.configuration);
  const orders = await loadOrders(auth.membership.businessUnitId);
  if (!orders.length) return fail("NO_WAITING_SHIPMENT_ORDERS", "当前没有核单通过、等待发货的订单。", 409);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(configuration.sheetName);
  sheet.columns = configuration.columns.map((column) => ({ header: column.header, key: column.field, width: 18 }));
  for (const order of orders) {
    sheet.addRow(Object.fromEntries(configuration.columns.map((column) => [column.field, fieldValue(order, column.field)])));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const output = await workbook.xlsx.writeBuffer();
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.templates",
    action: "logistics_template.export",
    targetType: "logistics_provider_template",
    targetId: template.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { orderCount: orders.length, orderIds: orders.map((order) => order.id) },
  });
  const safeCode = template.code.replace(/[^A-Z0-9_-]/g, "_");
  return new Response(Buffer.from(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeCode}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
