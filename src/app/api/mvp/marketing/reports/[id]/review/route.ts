import { NextRequest } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { prisma } from "@/lib/prisma";

const reviewSchema = z.object({
  action: z.enum(["RETURN", "LOCK"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await params;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "审核内容不正确。", 400, parsed.error.flatten());
  if (parsed.data.action === "RETURN" && !parsed.data.reason) return fail("RETURN_REASON_REQUIRED", "退回日报时必须填写原因。", 400);

  const report = await prisma.marketingDailyReport.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, status: true, businessUnitId: true, departmentId: true, siteId: true, ownerMembershipId: true },
  });
  if (!report) return fail("REPORT_NOT_FOUND", "日报不存在。", 404);
  const reviewAccess = await createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.report.review" });
  if (!reviewAccess.allowed || !reviewAccess.allows(report)) {
    return fail("FORBIDDEN", "没有审核该日报的权限。", 403);
  }
  if (report.status !== "SUBMITTED") return fail("REPORT_NOT_REVIEWABLE", "只有已提交的日报可以审核。", 409);

  const now = new Date();
  const isReturn = parsed.data.action === "RETURN";
  const result = await prisma.marketingDailyReport.updateMany({
    where: { id: report.id, status: "SUBMITTED" },
    data: isReturn
      ? { status: "RETURNED", reviewedByMembershipId: auth.membership.id, reviewedAt: now, returnReason: parsed.data.reason ?? null, lockedByMembershipId: null, lockedAt: null }
      : { status: "LOCKED", reviewedByMembershipId: auth.membership.id, reviewedAt: now, returnReason: null, lockedByMembershipId: auth.membership.id, lockedAt: now },
  });
  if (result.count !== 1) return fail("REPORT_NOT_REVIEWABLE", "日报状态已变化，请刷新后再审核。", 409);
  const updated = await prisma.marketingDailyReport.findUnique({
    where: { id: report.id },
    select: { id: true, status: true, reviewedAt: true, lockedAt: true, returnReason: true },
  });
  if (!updated) return fail("REPORT_NOT_FOUND", "日报不存在。", 404);
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.daily_report",
    action: isReturn ? "marketing.report.return" : "marketing.report.lock",
    targetType: "marketing_daily_report",
    targetId: report.id,
    businessUnitId: report.businessUnitId,
    roleId: auth.membership.roleId,
    details: { priorStatus: report.status, nextStatus: updated.status, reason: parsed.data.reason ?? null },
  });
  return ok(updated);
}
