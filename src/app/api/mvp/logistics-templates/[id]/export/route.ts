import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { commonDepartmentId, createLogisticsBatchNo, exportFieldValue, logisticsBatchHash } from "@/lib/logistics-batch";
import { parseLogisticsTemplateConfiguration } from "@/lib/logistics-provider-template";
import { prepareGeneratedSpreadsheetArtifact } from "@/lib/logistics-spreadsheet";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

function parseOrderIds(body: unknown) {
  const input = body && typeof body === "object" ? body as { orderIds?: unknown } : {};
  if (!Array.isArray(input.orderIds)) return [];
  return [...new Set(input.orderIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 100))];
}

export async function POST(request: NextRequest, context: RouteContext<"/api/mvp/logistics-templates/[id]/export">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const orderIds = parseOrderIds(body);
  if (!orderIds.length) return fail("ORDER_SELECTION_REQUIRED", "请先选择要发送给物流商的待发货订单。", 400);
  if (orderIds.length > 5000) return fail("TOO_MANY_SELECTED_ORDERS", "一次导出最多选择 5000 个订单。", 400);

  const template = await prisma.logisticsProviderTemplate.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId, isActive: true },
  });
  if (!template) return fail("TEMPLATE_NOT_FOUND", "物流商模板不存在或已停用。", 404);
  const configuration = parseLogisticsTemplateConfiguration(template.configuration);
  const exportColumns = configuration.columns.some((column) => column.field === "salesName")
    ? configuration.columns
    : [...configuration.columns, { field: "salesName" as const, header: "录单员工" }];

  const candidateOrders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      businessUnitId: auth.membership.businessUnitId,
      status: "WAITING_SHIPMENT",
    },
    include: { creatorUser: { select: { username: true, fullName: true } }, items: { orderBy: { id: "asc" }, include: { sku: { select: { code: true } } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (candidateOrders.length !== orderIds.length) {
    return fail("ORDER_SELECTION_INVALID", "所选订单中存在非待发货、已变更或当前范围不可用的记录。", 409);
  }

  const permissions = await Promise.all(candidateOrders.map((order) => checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "logistics.export_batch.create",
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
    targetMembershipId: order.ownedByMembershipId,
  })));
  if (permissions.some((decision) => !decision.allowed)) {
    return fail("FORBIDDEN", "当前权限不能导出所选订单。", 403);
  }

  const inFlight = await prisma.logisticsExportBatchItem.findFirst({
    where: {
      orderId: { in: candidateOrders.map((order) => order.id) },
      exportBatch: { is: { businessUnitId: auth.membership.businessUnitId } },
    },
    select: { exportBatch: { select: { batchNo: true } } },
  });
  if (inFlight) {
    return fail("ORDER_ALREADY_EXPORTED", `所选订单已通过物流批次 ${inFlight.exportBatch.batchNo} 导出。一个订单只能选择一个模板并导出一次。`, 409);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(configuration.sheetName);
  sheet.columns = exportColumns.map((column) => ({ header: column.header, key: column.field, width: 18 }));
  const rowSnapshots = candidateOrders.map((order) => {
    const values = exportColumns.map((column) => column.field === "shippingRoute"
      ? configuration.countryRoutes[order.recipientCountryCode?.toUpperCase() ?? ""] ?? ""
      : exportFieldValue(order, column.field));
    const payload = Object.fromEntries(exportColumns.map((column, index) => [`${index + 1}:${column.header}`, values[index]]));
    sheet.addRow(values);
    return { order, payload };
  });
  sheet.getRow(1).font = { bold: true, color: configuration.headerFontColor ? { argb: `FF${configuration.headerFontColor}` } : undefined };
  if (configuration.headerFill) sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${configuration.headerFill}` } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: exportColumns.length } };
  const output = Buffer.from(await workbook.xlsx.writeBuffer());
  const safeCode = template.code.replace(/[^A-Z0-9_-]/g, "_");
  const artifact = prepareGeneratedSpreadsheetArtifact(`${safeCode}-${new Date().toISOString().slice(0, 10)}.xlsx`, output);
  const batchNo = createLogisticsBatchNo();
  const templateSnapshot = {
    templateId: template.id,
    code: template.code,
    name: template.name,
    carrierName: template.carrierName,
    version: template.version,
    configuration: { ...configuration, columns: exportColumns },
  };

  await localDemoStorage.put({ storageKey: artifact.storageKey, bytes: output });
  let batch;
  try {
    batch = await prisma.$transaction(async (tx) => {
      const created = await tx.logisticsExportBatch.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          departmentId: commonDepartmentId(candidateOrders),
          templateId: template.id,
          templateVersion: template.version,
          batchNo,
          templateSnapshot: templateSnapshot as unknown as Prisma.InputJsonValue,
          orderCount: rowSnapshots.length,
          createdByMembershipId: auth.membership.id,
          items: {
            create: rowSnapshots.map(({ order, payload }) => ({
              orderId: order.id,
              orderNoSnapshot: order.orderNo,
              rowHash: logisticsBatchHash(payload),
              payloadSnapshot: payload as Prisma.InputJsonValue,
            })),
          },
          artifacts: {
            create: {
              legalEntityId: auth.membership.legalEntityId,
              businessUnitId: auth.membership.businessUnitId,
              kind: "EXPORT_WORKBOOK",
              originalName: artifact.originalName,
              storageKey: artifact.storageKey,
              mimeType: artifact.mimeType,
              sizeBytes: artifact.sizeBytes,
              sha256: artifact.sha256,
              createdByMembershipId: auth.membership.id,
            },
          },
        },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "logistics.export_batch",
        action: "logistics.export_batch.create",
        targetType: "logistics_export_batch",
        targetId: created.id,
        businessUnitId: created.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          batchNo: created.batchNo,
          template: { id: template.id, code: template.code, version: template.version },
          orderCount: rowSnapshots.length,
          orderIds: candidateOrders.map((order) => order.id),
          artifact: { originalName: artifact.originalName, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
        },
      }, tx);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await localDemoStorage.delete(artifact.storageKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return fail("EXPORT_BATCH_CONFLICT", "导出批次刚刚发生冲突，请刷新后重新选择订单。", 409);
    }
    throw error;
  }

  return new Response(output, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename="${artifact.originalName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Logistics-Export-Batch-Id": batch.id,
      "X-Logistics-Export-Batch-No": batch.batchNo,
    },
  });
}
