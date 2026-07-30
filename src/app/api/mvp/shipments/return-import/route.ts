import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { logisticsBatchHash } from "@/lib/logistics-batch";
import { checkLogisticsBatchAccess } from "@/lib/logistics-batch-access";
import { parseLogisticsTemplateConfiguration } from "@/lib/logistics-provider-template";
import { parseLogisticsReturnWorkbookDetails, trackingNumberProblem } from "@/lib/logistics-return-import";
import { prepareReturnSpreadsheetArtifact } from "@/lib/logistics-spreadsheet";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

type PreviewRow = {
  rowNumber: number;
  orderNo: string;
  trackingNo: string;
  carrier: string;
  providerStatus: string;
  employee: string | null;
  orderId: string | null;
  shipmentId: string | null;
  result: "READY" | "WARNING" | "REJECTED";
  message: string;
  sourceRowHash: string;
};

function savedPreviewResponse(importBatch: {
  id: string;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
  status: string;
  rows: Array<{
    rowNumber: number;
    orderNo: string;
    trackingNo: string;
    carrier: string | null;
    providerStatus: string | null;
    orderId: string | null;
    shipmentId: string | null;
    status: "READY" | "WARNING" | "REJECTED" | "IMPORTED";
    message: string;
    sourceRowHash: string;
  }>;
}) {
  return {
    importBatchId: importBatch.id,
    idempotent: true,
    importStatus: importBatch.status,
    rows: importBatch.rows.map((row) => ({
      rowNumber: row.rowNumber,
      orderNo: row.orderNo,
      trackingNo: row.trackingNo,
      carrier: row.carrier ?? "",
      providerStatus: row.providerStatus ?? "",
      employee: null,
      orderId: row.orderId,
      shipmentId: row.shipmentId,
      result: row.status === "IMPORTED" ? "WARNING" : row.status,
      message: row.status === "IMPORTED" ? "该行已在此前确认回填。" : row.message,
      sourceRowHash: row.sourceRowHash,
    })),
    summary: {
      total: importBatch.totalRows,
      ready: importBatch.readyRows,
      warning: importBatch.warningRows,
      rejected: importBatch.rejectedRows,
    },
  };
}

function templateConfiguration(snapshot: unknown) {
  const source = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  return parseLogisticsTemplateConfiguration(source.configuration);
}

function templateCarrier(snapshot: unknown) {
  const source = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  return typeof source.carrierName === "string" && source.carrierName.trim() ? source.carrierName.trim() : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const form = await request.formData();
  const file = form.get("file");
  const exportBatchId = typeof form.get("exportBatchId") === "string" ? String(form.get("exportBatchId")).trim() : "";
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请先选择物流商回传的表格。", 400);
  if (!exportBatchId) return fail("EXPORT_BATCH_REQUIRED", "请先选择此前导出的物流商批次。", 400);

  const exportBatch = await prisma.logisticsExportBatch.findFirst({
    where: { id: exportBatchId, businessUnitId: auth.membership.businessUnitId },
    include: {
      items: {
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              status: true,
              legalEntityId: true,
              businessUnitId: true,
              departmentId: true,
              siteId: true,
              creatorUserId: true,
              ownedByMembershipId: true,
              creatorUser: { select: { username: true, fullName: true } },
              shipments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, trackingNo: true, carrier: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!exportBatch) return fail("EXPORT_BATCH_NOT_FOUND", "物流导出批次不存在或不在当前业务范围。", 404);
  const batchAccess = await checkLogisticsBatchAccess(auth, exportBatch, "logistics.return_import.preview");
  if (!batchAccess.allowed) return fail("FORBIDDEN", "当前角色无权预检该物流商回传。", 403);
  if (exportBatch.status === "CANCELLED" || exportBatch.status === "RETURN_IMPORTED") {
    return fail("EXPORT_BATCH_CLOSED", "该物流导出批次已结束，不能再回传。", 409);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let artifact;
  let parsed;
  try {
    artifact = prepareReturnSpreadsheetArtifact(file.name, bytes);
    parsed = await parseLogisticsReturnWorkbookDetails(bytes, templateConfiguration(exportBatch.templateSnapshot).returnWorkbook);
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORKBOOK_INVALID";
    const message = code === "LEGACY_XLS_CONVERSION_REQUIRED"
      ? "当前安全解析器暂不直接读取旧式 .xls/.xlt，请在 Excel 中另存为 .xlsx 后上传；系统不会冒险丢失前导零。"
      : code === "REQUIRED_COLUMNS_MISSING"
        ? "未在允许扫描的表头行中识别到该模板配置的订单号和物流单号列。"
        : code === "WORKBOOK_DIMENSION_LIMIT_EXCEEDED" || code === "WORKBOOK_SHEET_LIMIT_EXCEEDED"
          ? "表格规模超过本次安全预检上限。"
          : "无法安全解析该表格。";
    return fail(code, message, 400);
  }
  if (parsed.rows.length > 5000) return fail("TOO_MANY_ROWS", "一次回传预检不超过 5000 行。", 400);

  const existingImport = await prisma.logisticsReturnImportBatch.findUnique({
    where: { exportBatchId_sha256: { exportBatchId: exportBatch.id, sha256: artifact.sha256 } },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (existingImport) return ok(savedPreviewResponse(existingImport));

  const itemByOrderNo = new Map(exportBatch.items.map((item) => [item.orderNoSnapshot, item]));
  const trackingCounts = new Map<string, number>();
  const orderCounts = new Map<string, number>();
  for (const row of parsed.rows) {
    if (row.trackingNo) trackingCounts.set(row.trackingNo, (trackingCounts.get(row.trackingNo) ?? 0) + 1);
    if (row.orderNo) orderCounts.set(row.orderNo, (orderCounts.get(row.orderNo) ?? 0) + 1);
  }
  const existingTracking = await prisma.shipment.findMany({
    where: {
      businessUnitId: auth.membership.businessUnitId,
      trackingNo: { in: [...trackingCounts.keys()] },
    },
    select: { id: true, orderId: true, trackingNo: true },
  });
  const existingByTracking = new Map(existingTracking.map((shipment) => [shipment.trackingNo!, shipment]));
  const carrierFallback = templateCarrier(exportBatch.templateSnapshot);

  const authorization = await Promise.all(exportBatch.items.map((item) => checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "logistics.return_import.preview",
    targetBusinessUnitId: item.order.businessUnitId,
    targetDepartmentId: item.order.departmentId,
    targetSiteId: item.order.siteId,
    targetUserId: item.order.creatorUserId,
    targetMembershipId: item.order.ownedByMembershipId,
  })));
  const canPreviewByOrderId = new Map(exportBatch.items.map((item, index) => [item.orderId, authorization[index].allowed]));

  const preview: PreviewRow[] = parsed.rows.map((row) => {
    const item = itemByOrderNo.get(row.orderNo);
    const sourceRowHash = logisticsBatchHash({ exportBatchId, rowNumber: row.rowNumber, orderNo: row.orderNo, trackingNo: row.trackingNo, carrier: row.carrier, providerStatus: row.providerStatus });
    if (!item || !canPreviewByOrderId.get(item.orderId)) {
      return { ...row, carrier: row.carrier || carrierFallback || "", employee: null, orderId: null, shipmentId: null, result: "REJECTED", message: "订单不属于当前导出批次或当前权限范围。", sourceRowHash };
    }
    const order = item.order;
    const employee = order.creatorUser.fullName || order.creatorUser.username;
    const latest = order.shipments[0];
    const carrier = row.carrier || carrierFallback || "";
    const problem = trackingNumberProblem(row.trackingNo);
    if (order.status !== "WAITING_SHIPMENT") {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: `订单状态为 ${order.status}，不允许回填。`, sourceRowHash };
    }
    if (!carrier) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "回传表和模板都未提供承运商，不能写入不明物流商。", sourceRowHash };
    }
    if (problem) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: problem, sourceRowHash };
    }
    if ((orderCounts.get(row.orderNo) ?? 0) > 1) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "回传文件中同一订单重复出现。", sourceRowHash };
    }
    if ((trackingCounts.get(row.trackingNo) ?? 0) > 1) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "回传文件中物流单号重复。", sourceRowHash };
    }
    const occupied = existingByTracking.get(row.trackingNo);
    if (occupied && occupied.orderId !== order.id) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "物流单号已被其他订单使用。", sourceRowHash };
    }
    if (latest?.trackingNo === row.trackingNo) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest.id, result: "WARNING", message: "该订单已存在相同物流单号，无需重复回填。", sourceRowHash };
    }
    if (latest?.trackingNo && latest.trackingNo !== row.trackingNo) {
      return { ...row, carrier, employee, orderId: order.id, shipmentId: latest.id, result: "REJECTED", message: "订单已有其他物流单号，请按更正流程处理。", sourceRowHash };
    }
    return { ...row, carrier, employee, orderId: order.id, shipmentId: latest?.id ?? null, result: "READY", message: row.providerStatus ? `可回填；物流商状态“${row.providerStatus}”仅留档，不会自动确认发货。` : "可回填。", sourceRowHash };
  });

  await localDemoStorage.put({ storageKey: artifact.storageKey, bytes });
  let importBatch;
  try {
    importBatch = await prisma.$transaction(async (tx) => {
      const created = await tx.logisticsReturnImportBatch.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          exportBatchId: exportBatch.id,
          originalName: artifact.originalName,
          storageKey: artifact.storageKey,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          sha256: artifact.sha256,
          mappingSnapshot: {
            worksheetName: parsed.worksheetName,
            headerRowNumber: parsed.headerRowNumber,
            mapping: templateConfiguration(exportBatch.templateSnapshot).returnWorkbook,
          } as Prisma.InputJsonValue,
          totalRows: preview.length,
          readyRows: preview.filter((row) => row.result === "READY").length,
          warningRows: preview.filter((row) => row.result === "WARNING").length,
          rejectedRows: preview.filter((row) => row.result === "REJECTED").length,
          previewedByMembershipId: auth.membership.id,
          rows: {
            create: preview.map((row) => ({
              rowNumber: row.rowNumber,
              orderNo: row.orderNo,
              trackingNo: row.trackingNo,
              carrier: row.carrier || null,
              providerStatus: row.providerStatus || null,
              sourceRowHash: row.sourceRowHash,
              orderId: row.orderId,
              shipmentId: row.shipmentId,
              status: row.result,
              message: row.message,
            })),
          },
          artifacts: {
            create: {
              legalEntityId: auth.membership.legalEntityId,
              businessUnitId: auth.membership.businessUnitId,
              kind: "RETURN_WORKBOOK",
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
      await tx.logisticsExportBatch.updateMany({
        where: { id: exportBatch.id, status: { in: ["EXPORTED", "SENT_TO_PROVIDER", "RETURN_PREVIEWED"] } },
        data: { status: "RETURN_PREVIEWED" },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "logistics.return_import",
        action: "logistics.return_import.preview",
        targetType: "logistics_return_import_batch",
        targetId: created.id,
        businessUnitId: auth.membership.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          exportBatchId: exportBatch.id,
          exportBatchNo: exportBatch.batchNo,
          artifact: { originalName: artifact.originalName, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
          worksheetName: parsed.worksheetName,
          headerRowNumber: parsed.headerRowNumber,
          summary: { total: preview.length, ready: created.readyRows, warning: created.warningRows, rejected: created.rejectedRows },
        },
      }, tx);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await localDemoStorage.delete(artifact.storageKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.logisticsReturnImportBatch.findUnique({
        where: { exportBatchId_sha256: { exportBatchId: exportBatch.id, sha256: artifact.sha256 } },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      if (duplicate) return ok(savedPreviewResponse(duplicate));
    }
    throw error;
  }

  return ok({
    importBatchId: importBatch.id,
    rows: preview,
    summary: { total: preview.length, ready: importBatch.readyRows, warning: importBatch.warningRows, rejected: importBatch.rejectedRows },
  });
}
