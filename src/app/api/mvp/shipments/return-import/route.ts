import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { fail, ok } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { type ReturnWorkbookAliases, parseLogisticsReturnWorkbook, trackingNumberProblem } from "@/lib/logistics-return-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

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
};

function parseAliases(raw: FormDataEntryValue | null): ReturnWorkbookAliases {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ReturnWorkbookAliases;
  } catch {
    throw fail("INVALID_ALIAS_PAYLOAD", "映射参数解析失败", 400);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) {
    return fail("FORBIDDEN", "当前角色没有权限导入物流单号", 403);
  }

  const form = await request.formData();
  const file = form.get("file");
  const commit = form.get("commit") === "true";
  const aliases = parseAliases(form.get("aliases"));

  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请先选择用于回传的 XLSX 文件。", 400);
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return fail("XLSX_REQUIRED", "只支持 .xlsx 文件。", 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return fail("FILE_TOO_LARGE", "文件大小不能超过 10MB。", 400);
  }

  let inputRows;
  try {
    inputRows = await parseLogisticsReturnWorkbook(Buffer.from(await file.arrayBuffer()), aliases);
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORKBOOK_INVALID";
    return fail(
      code,
      code === "REQUIRED_COLUMNS_MISSING" ? "未识别到订单号或物流单号列" : "无法解析文件内容",
      400,
    );
  }

  if (inputRows.length > 5000) {
    return fail("TOO_MANY_ROWS", "一次导入不超过5000行。", 400);
  }

  const orderNumbers = [...new Set(inputRows.map((row) => row.orderNo).filter(Boolean))];
  const orders = await prisma.order.findMany({
    where: { businessUnitId: auth.membership.businessUnitId, orderNo: { in: orderNumbers } },
    select: {
      id: true,
      orderNo: true,
      status: true,
      legalEntityId: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      creatorUserId: true,
      creatorUser: { select: { username: true } },
      shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, trackingNo: true, carrier: true, status: true } },
    },
  });
  const orderAccess = await Promise.all(orders.map((order) => checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.create",
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
  })));
  const orderByNo = new Map(orders.filter((_, index) => orderAccess[index].allowed).map((order) => [order.orderNo, order]));

  const trackingCounts = new Map<string, number>();
  for (const row of inputRows) {
    if (row.trackingNo) trackingCounts.set(row.trackingNo, (trackingCounts.get(row.trackingNo) ?? 0) + 1);
  }
  const existingTracking = await prisma.shipment.findMany({
    where: {
      businessUnitId: auth.membership.businessUnitId,
      trackingNo: { in: [...trackingCounts.keys()] },
    },
    select: { id: true, orderId: true, trackingNo: true },
  });
  const existingByTracking = new Map(existingTracking.map((shipment) => [shipment.trackingNo!, shipment]));

  const preview: PreviewRow[] = inputRows.map((row) => {
    const order = orderByNo.get(row.orderNo);
    const problem = trackingNumberProblem(row.trackingNo);
    if (!order) {
      return { ...row, employee: null, orderId: null, shipmentId: null, result: "REJECTED", message: "未找到订单号。" };
    }
    const latest = order.shipments[0];
    if (order.status !== "WAITING_SHIPMENT") {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: `订单状态为 ${order.status}，不允许回填。` };
    }
    if (problem) {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: problem };
    }
    if ((trackingCounts.get(row.trackingNo) ?? 0) > 1) {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "物流单号重复。" };
    }
    const occupied = existingByTracking.get(row.trackingNo);
    if (occupied && occupied.orderId !== order.id) {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest?.id ?? null, result: "REJECTED", message: "物流单号已被其他订单使用。" };
    }
    if (latest?.trackingNo === row.trackingNo) {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest.id, result: "WARNING", message: "该订单已存在相同物流单号，无需重复回填。" };
    }
    if (latest?.trackingNo && latest.trackingNo !== row.trackingNo) {
      return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest.id, result: "REJECTED", message: "订单已有其他物流单号，请管理员审核后单独处理。" };
    }
    return { ...row, employee: order.creatorUser.username, orderId: order.id, shipmentId: latest?.id ?? null, result: "READY", message: "可回填。" };
  });

  if (!commit) {
    return ok({
      rows: preview,
      summary: {
        total: preview.length,
        ready: preview.filter((row) => row.result === "READY").length,
        warning: preview.filter((row) => row.result === "WARNING").length,
        rejected: preview.filter((row) => row.result === "REJECTED").length,
      },
    });
  }

  const readyRows = preview.filter((row) => row.result === "READY" && row.orderId);
  const imported = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const row of readyRows) {
      const order = orderByNo.get(row.orderNo)!;
      const data = {
        carrier: row.carrier || "物流商",
        trackingNo: row.trackingNo,
        memo: `回传单号 ${row.trackingNo} 由文件 ${file.name} 回填`,
      };
      const shipment = row.shipmentId
        ? await tx.shipment.update({ where: { id: row.shipmentId }, data })
        : await tx.shipment.create({
            data: {
              orderId: order.id,
              legalEntityId: order.legalEntityId,
              businessUnitId: order.businessUnitId,
              siteId: order.siteId ?? auth.membership.siteId,
              status: "PENDING",
              ...data,
            },
          });

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          eventType: "TRACKING_NUMBER_ASSIGNED",
          statusMilestone: "PENDING",
          source: "PROVIDER_RETURN_IMPORT",
          externalEventKey: `return-import:${order.id}:${row.trackingNo}`,
          memo: `文件回填 第${row.rowNumber}行，物流单号 ${row.trackingNo}`,
          actorMembershipId: auth.membership.id,
        },
      });
      results.push({ orderId: order.id, shipmentId: shipment.id, trackingNo: row.trackingNo });
    }
    return results;
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.return_import",
    action: "shipment.tracking.batch_import",
    targetType: "shipment_import",
    targetId: crypto.randomUUID(),
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      fileName: file.name,
      totalRows: preview.length,
      importedRows: imported.length,
      rejectedRows: preview.filter((row) => row.result === "REJECTED").length,
      orderIds: imported.map((row) => row.orderId),
    } satisfies Prisma.InputJsonObject,
  });

  return ok({ imported, rows: preview, summary: { total: preview.length, imported: imported.length } });
}
