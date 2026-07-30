import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkLogisticsBatchAccess } from "@/lib/logistics-batch-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  const importBatch = await prisma.logisticsReturnImportBatch.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: {
      rows: { orderBy: { rowNumber: "asc" } },
      exportBatch: {
        include: {
          items: {
            include: {
              order: {
                select: {
                  id: true,
                  status: true,
                  legalEntityId: true,
                  businessUnitId: true,
                  departmentId: true,
                  siteId: true,
                  creatorUserId: true,
                  ownedByMembershipId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!importBatch) return fail("RETURN_IMPORT_NOT_FOUND", "物流商回传预检不存在。", 404);
  const batchAccess = await checkLogisticsBatchAccess(auth, importBatch.exportBatch, "logistics.return_import.confirm");
  if (!batchAccess.allowed) return fail("FORBIDDEN", "当前角色无权确认该物流商回传。", 403);
  if (importBatch.status !== "PREVIEWED") return fail("RETURN_IMPORT_ALREADY_FINALIZED", "该回传批次已确认或已取消。", 409);
  if (!await localDemoStorage.exists(importBatch.storageKey)) return fail("RETURN_IMPORT_SOURCE_MISSING", "原始回传文件不存在，不能确认写入。", 409);

  const readyRows = importBatch.rows.filter((row) => row.status === "READY" && row.orderId);
  if (!readyRows.length) return fail("NO_READY_ROWS", "该回传预检没有可确认回填的记录。", 409);
  const itemByOrderId = new Map(importBatch.exportBatch.items.map((item) => [item.orderId, item]));
  const permissionDecisions = await Promise.all(readyRows.map((row) => {
    const item = itemByOrderId.get(row.orderId!);
    if (!item) return Promise.resolve({ allowed: false, reasons: ["EXPORT_BATCH_ITEM_MISSING"] });
    return checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "logistics.return_import.confirm",
      targetBusinessUnitId: item.order.businessUnitId,
      targetDepartmentId: item.order.departmentId,
      targetSiteId: item.order.siteId,
      targetUserId: item.order.creatorUserId,
      targetMembershipId: item.order.ownedByMembershipId,
    });
  }));
  if (permissionDecisions.some((decision) => !decision.allowed)) {
    return fail("FORBIDDEN", "当前权限不能确认该批次中的全部待回填订单。", 403);
  }

  let imported;
  try {
    imported = await prisma.$transaction(async (tx) => {
      // Claim the preview inside the serializable transaction. This makes a
      // double-click or a second operator's confirmation fail safely rather
      // than creating duplicate tracking assignments.
      const claimed = await tx.logisticsReturnImportBatch.updateMany({
        where: { id: importBatch.id, status: "PREVIEWED" },
        data: { status: "IMPORTED", importedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
      const results: Array<{ rowId: string; orderId: string; shipmentId: string; trackingNo: string }> = [];
      for (const row of readyRows) {
        const item = itemByOrderId.get(row.orderId!)!;
        const order = await tx.order.findFirst({
          where: { id: item.orderId, businessUnitId: importBatch.businessUnitId, status: "WAITING_SHIPMENT" },
          select: { id: true, legalEntityId: true, businessUnitId: true, siteId: true },
        });
        if (!order) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
        const existing = await tx.shipment.findFirst({
          where: { orderId: order.id, businessUnitId: order.businessUnitId, status: "PENDING" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, trackingNo: true },
        });
        if (existing?.trackingNo) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
        const duplicate = await tx.shipment.findFirst({
          where: {
            businessUnitId: order.businessUnitId,
            trackingNo: row.trackingNo,
            ...(existing ? { NOT: { id: existing.id } } : {}),
          },
          select: { id: true },
        });
        if (duplicate) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
        const memo = `物流商回传批次 ${importBatch.exportBatch.batchNo} / 预检 ${importBatch.id} 第${row.rowNumber}行；回填物流单号，尚未确认发货。`;
        let shipment: { id: string };
        if (existing) {
          const updated = await tx.shipment.updateMany({
            where: { id: existing.id, status: "PENDING", trackingNo: null },
            data: { carrier: row.carrier, trackingNo: row.trackingNo, memo },
          });
          if (updated.count !== 1) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
          shipment = { id: existing.id };
        } else {
          shipment = await tx.shipment.create({
            data: {
              orderId: order.id,
              legalEntityId: order.legalEntityId,
              businessUnitId: order.businessUnitId,
              siteId: order.siteId,
              carrier: row.carrier,
              trackingNo: row.trackingNo,
              status: "PENDING",
              memo,
            },
            select: { id: true },
          });
        }
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            eventType: "TRACKING_NUMBER_ASSIGNED",
            statusMilestone: "PENDING",
            source: "PROVIDER_RETURN_IMPORT",
            externalEventKey: `return-import:${importBatch.id}:${row.sourceRowHash}`,
            memo: `${memo}${row.providerStatus ? ` 物流商原始状态：${row.providerStatus}` : ""}`,
            actorMembershipId: auth.membership.id,
          },
        });
        await tx.logisticsExportBatchItem.update({
          where: { exportBatchId_orderId: { exportBatchId: importBatch.exportBatchId, orderId: order.id } },
          data: { trackingNo: row.trackingNo, importedAt: new Date() },
        });
        const rowUpdated = await tx.logisticsReturnImportRow.updateMany({
          where: { id: row.id, status: "READY" },
          data: { status: "IMPORTED", shipmentId: shipment.id, importedAt: new Date() },
        });
        if (rowUpdated.count !== 1) throw new Error("RETURN_IMPORT_PREVIEW_STALE");
        results.push({ rowId: row.id, orderId: order.id, shipmentId: shipment.id, trackingNo: row.trackingNo });
      }
      const remaining = await tx.logisticsExportBatchItem.count({
        where: { exportBatchId: importBatch.exportBatchId, trackingNo: null },
      });
      await tx.logisticsReturnImportBatch.update({
        where: { id: importBatch.id },
        data: { importedRows: results.length },
      });
      await tx.logisticsExportBatch.update({
        where: { id: importBatch.exportBatchId },
        data: { status: remaining === 0 ? "RETURN_IMPORTED" : "RETURN_PREVIEWED" },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "logistics.return_import",
        action: "logistics.return_import.confirm",
        targetType: "logistics_return_import_batch",
        targetId: importBatch.id,
        businessUnitId: importBatch.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          exportBatchId: importBatch.exportBatchId,
          exportBatchNo: importBatch.exportBatch.batchNo,
          source: { originalName: importBatch.originalName, sha256: importBatch.sha256 },
          importedRows: results.length,
          orderIds: results.map((result) => result.orderId),
          invariant: "tracking_assignment_keeps_order_WAITING_SHIPMENT_and_shipment_PENDING",
        },
      }, tx);
      return results;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "RETURN_IMPORT_PREVIEW_STALE")
      || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code))
    ) {
      return fail("RETURN_IMPORT_PREVIEW_STALE", "预检后订单或物流单号已被处理，本次确认未写入，请重新预检。", 409);
    }
    throw error;
  }

  return ok({ imported, summary: { imported: imported.length, orderStatus: "WAITING_SHIPMENT", shipmentStatus: "PENDING" } });
}
