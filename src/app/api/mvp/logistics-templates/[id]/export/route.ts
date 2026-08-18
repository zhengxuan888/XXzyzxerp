import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { commonDepartmentId, createLogisticsBatchNo, logisticsBatchHash } from "@/lib/logistics-batch";
import {
  findHongyaForwardDeclarationIssues,
  findHongyaForwardTemplateDeclarationIssues,
  findLogisticsAddressReviewIssues,
  findMissingLogisticsShippingRoutes,
  isHongyaAddressReviewTemplate,
  logisticsExportFilename,
  normalizeLogisticsExportColumns,
} from "@/lib/logistics-export-review";
import { buildLogisticsExportWorkbook } from "@/lib/logistics-export-workbook";
import { parseLogisticsTemplateConfiguration } from "@/lib/logistics-provider-template";
import { prepareGeneratedSpreadsheetArtifact } from "@/lib/logistics-spreadsheet";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

type RouteParams = { params: Promise<{ id: string }> };

function parseOrderIds(body: unknown) {
  const input = body && typeof body === "object" ? body as { orderIds?: unknown } : {};
  if (!Array.isArray(input.orderIds)) return [];
  return [...new Set(input.orderIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 100))];
}

export async function POST(request: NextRequest, context: RouteParams) {
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
  const exportColumns = normalizeLogisticsExportColumns(template.code, configuration.columns);
  if (!exportColumns.some((column) => column.field === "salesName")) {
    exportColumns.push({ field: "salesName", header: "录单员工" });
  }
  const needsProductConfiguration = isHongyaAddressReviewTemplate(template.code);
  if (needsProductConfiguration && !exportColumns.some((column) => column.field === "productConfigurations")) {
    exportColumns.push({ field: "productConfigurations", header: "具体型号配置" });
  }
  const templateDeclarationIssues = findHongyaForwardTemplateDeclarationIssues(template.code, exportColumns);
  if (templateDeclarationIssues.length) {
    return fail(
      "HONGYA_FORWARD_TEMPLATE_DECLARATION_INVALID",
      `转寄物流模板申报列配置不正确，已禁止生成文件：${templateDeclarationIssues.join("、")}。请先修复模板后重试。`,
      409,
      { invalidFields: templateDeclarationIssues },
    );
  }

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

  const addressIssues = findLogisticsAddressReviewIssues(template.code, candidateOrders, exportColumns);
  if (addressIssues.length) {
    const preview = addressIssues
      .slice(0, 10)
      .map((issue) => `${issue.orderNo}：${issue.missingFields.join("、")}`)
      .join("；");
    const remaining = addressIssues.length > 10 ? `；另有 ${addressIssues.length - 10} 单` : "";
    return fail(
      "LOGISTICS_ADDRESS_INCOMPLETE",
      `以下订单地址资料不完整，无法生成物流核对版：${preview}${remaining}。请补全后重试。`,
      409,
      { orders: addressIssues },
    );
  }

  const routeIssues = findMissingLogisticsShippingRoutes(
    exportColumns,
    configuration.countryRoutes,
    candidateOrders,
  );
  if (routeIssues.length) {
    const preview = routeIssues
      .slice(0, 10)
      .map((issue) => `${issue.orderNo}：${issue.countryCode}`)
      .join("；");
    const remaining = routeIssues.length > 10 ? `；另有 ${routeIssues.length - 10} 单` : "";
    return fail(
      "LOGISTICS_ROUTE_NOT_CONFIGURED",
      `以下订单没有匹配的国家运输线路：${preview}${remaining}。请先在物流模板中配置后再导出。`,
      409,
      { orders: routeIssues },
    );
  }

  const declarationIssues = findHongyaForwardDeclarationIssues(template.code, candidateOrders);
  if (declarationIssues.length) {
    const preview = declarationIssues
      .slice(0, 10)
      .map((issue) => `${issue.orderNo}：${issue.invalidFields.join("、")}`)
      .join("；");
    const remaining = declarationIssues.length > 10 ? `；另有 ${declarationIssues.length - 10} 单` : "";
    return fail(
      "HONGYA_FORWARD_DECLARATION_INVALID",
      `以下转寄订单申报资料不完整，已禁止生成物流文件：${preview}${remaining}。请先补正订单申报金额和 EUR 申报币种后重试。`,
      409,
      { orders: declarationIssues },
    );
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

  const { output, payloads } = await buildLogisticsExportWorkbook({
    templateCode: template.code,
    sheetName: configuration.sheetName,
    columns: exportColumns,
    countryRoutes: configuration.countryRoutes,
    headerFill: configuration.headerFill,
    headerFontColor: configuration.headerFontColor,
    orders: candidateOrders,
  });
  const rowSnapshots = candidateOrders.map((order, index) => ({ order, payload: payloads[index] }));
  const artifact = prepareGeneratedSpreadsheetArtifact(
    logisticsExportFilename(template.code, new Date().toISOString().slice(0, 10)),
    output,
  );
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
