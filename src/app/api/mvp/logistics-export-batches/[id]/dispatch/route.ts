import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkLogisticsBatchAccess } from "@/lib/logistics-batch-access";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  const batch = await prisma.logisticsExportBatch.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, batchNo: true, businessUnitId: true, departmentId: true, createdByMembershipId: true, status: true },
  });
  if (!batch) return fail("BATCH_NOT_FOUND", "物流导出批次不存在。", 404);
  const access = await checkLogisticsBatchAccess(auth, batch, "logistics.export_batch.dispatch");
  if (!access.allowed) return fail("FORBIDDEN", "无权标记该物流批次已发送。", 403);
  if (batch.status === "CANCELLED" || batch.status === "RETURN_IMPORTED") {
    return fail("BATCH_NOT_DISPATCHABLE", "该批次已结束，不能再标记为已发送。", 409);
  }
  if (batch.status === "SENT_TO_PROVIDER") return ok({ batchId: batch.id, status: batch.status, unchanged: true });

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.logisticsExportBatch.updateMany({
      where: { id: batch.id, status: "EXPORTED" },
      data: { status: "SENT_TO_PROVIDER", dispatchedAt: new Date(), dispatchNote: note || null },
    });
    if (result.count !== 1) throw new Error("BATCH_STATUS_STALE");
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "logistics.export_batch",
      action: "logistics.export_batch.dispatch",
      targetType: "logistics_export_batch",
      targetId: batch.id,
      businessUnitId: batch.businessUnitId,
      roleId: auth.membership.roleId,
      details: { batchNo: batch.batchNo, note: note || null },
    }, tx);
    return { batchId: batch.id, status: "SENT_TO_PROVIDER" as const };
  }).catch((error) => {
    if (error instanceof Error && error.message === "BATCH_STATUS_STALE") return null;
    throw error;
  });
  if (!updated) return fail("BATCH_STATUS_STALE", "批次状态已被其他人更新，请刷新后查看。", 409);
  return ok(updated);
}
