import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, parsePagination } from "@/lib/api-response";
import { createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { calculateMetrics, hasRequiredDirectMetrics, normalizeMetricInput, type MetricDefinitionInput, type NormalizedMetricInput } from "@/lib/marketing-metrics";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const metricInputSchema = z.object({
  metricDefinitionId: z.string().uuid(),
  value: z.string().trim().min(1).max(80),
});

const createSchema = z.object({
  sourceId: z.string().uuid(),
  productId: z.string().uuid().nullish(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marketCode: z.string().trim().max(20).nullish(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  note: z.string().trim().max(2000).nullish(),
  values: z.array(metricInputSchema).max(100),
  submit: z.boolean().default(false),
});

function asDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function isIsoDate(value: string | null) {
  return Boolean(value && asDate(value));
}

function selectableSourceWhere(membership: { businessUnitId: string; departmentId: string | null; siteId: string | null }): Prisma.MarketingSourceWhereInput {
  const scoped: Prisma.MarketingSourceWhereInput[] = [{ departmentId: null, siteId: null }];
  if (membership.departmentId) scoped.push({ departmentId: membership.departmentId, siteId: null });
  if (membership.siteId) {
    scoped.push({ departmentId: null, siteId: membership.siteId });
    if (membership.departmentId) scoped.push({ departmentId: membership.departmentId, siteId: membership.siteId });
  }
  return { businessUnitId: membership.businessUnitId, isActive: true, OR: scoped };
}

function definitionForCalculation(definition: {
  id: string; code: string; name: string; valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
  calculation: "DIRECT" | "RATIO"; numeratorMetricCode: string | null; denominatorMetricCode: string | null;
  multiplier: { toString(): string } | null; inputRequired: boolean; showOnWorkbench: boolean; sortOrder: number; isActive: boolean;
}): MetricDefinitionInput {
  return {
    ...definition,
    multiplier: definition.multiplier ? new Prisma.Decimal(definition.multiplier.toString()) : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const [access, updateAccess, reviewAccess] = await Promise.all([
    createMarketingReportAccessPlan({ membership: auth.membership }),
    createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.report.update" }),
    createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.report.review" }),
  ]);
  if (!access.allowed) return fail("FORBIDDEN", "没有查看投放日报的权限。", 403);

  const { searchParams } = request.nextUrl;
  const pagination = parsePagination(request, 100);
  const status = searchParams.get("status");
  const sourceId = searchParams.get("sourceId");
  const ownerMembershipId = searchParams.get("ownerMembershipId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search")?.trim();
  if (status && !["DRAFT", "SUBMITTED", "RETURNED", "LOCKED"].includes(status)) return fail("INVALID_STATUS", "日报状态不正确。", 400);
  if (dateFrom && !isIsoDate(dateFrom)) return fail("INVALID_DATE", "开始日期不正确。", 400);
  if (dateTo && !isIsoDate(dateTo)) return fail("INVALID_DATE", "结束日期不正确。", 400);
  const parsedDateFrom = dateFrom ? asDate(dateFrom) : null;
  const parsedDateTo = dateTo ? asDate(dateTo) : null;
  if (parsedDateFrom && parsedDateTo && parsedDateTo < parsedDateFrom) return fail("INVALID_DATE_RANGE", "结束日期不能早于开始日期。", 400);

  const baseWhere: Prisma.MarketingDailyReportWhereInput = {
    AND: [
      access.where,
      { businessUnitId: auth.membership.businessUnitId },
      sourceId ? { sourceId } : {},
      ownerMembershipId ? { ownerMembershipId } : {},
      dateFrom || dateTo
        ? {
            reportDate: {
              ...(parsedDateFrom ? { gte: parsedDateFrom } : {}),
              ...(parsedDateTo ? { lte: parsedDateTo } : {}),
            },
          }
        : {},
      search
        ? {
            OR: [
              { source: { name: { contains: search, mode: "insensitive" as const } } },
              { ownerMembership: { user: { fullName: { contains: search, mode: "insensitive" as const } } } },
              { ownerMembership: { user: { username: { contains: search, mode: "insensitive" as const } } } },
              { marketCode: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {},
    ],
  };
  const where: Prisma.MarketingDailyReportWhereInput = status
    ? { AND: [baseWhere, { status: status as "DRAFT" | "SUBMITTED" | "RETURNED" | "LOCKED" }] }
    : baseWhere;
  const [total, reports, definitions, statusSummary, sources, memberships] = await Promise.all([
    prisma.marketingDailyReport.count({ where }),
    prisma.marketingDailyReport.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        source: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true } },
        ownerMembership: { include: { user: { select: { fullName: true, username: true } } } },
        reviewedByMembership: { include: { user: { select: { fullName: true } } } },
        lockedByMembership: { include: { user: { select: { fullName: true } } } },
        metricValues: { select: { metricDefinitionId: true, valueCents: true, valueDecimal: true } },
      },
    }),
    prisma.marketingMetricDefinition.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true, code: true, name: true, valueType: true, calculation: true, numeratorMetricCode: true,
        denominatorMetricCode: true, multiplier: true, inputRequired: true, showOnWorkbench: true, sortOrder: true, isActive: true,
      },
    }),
    prisma.marketingDailyReport.groupBy({ where: baseWhere, by: ["status"], _count: { _all: true } }),
    prisma.marketingSource.findMany({ where: selectableSourceWhere(auth.membership), orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
    prisma.membership.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
        isActive: true,
        OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
      },
      select: {
        id: true,
        departmentId: true,
        siteId: true,
        user: { select: { fullName: true, username: true } },
      },
      orderBy: [{ user: { fullName: "asc" } }, { id: "asc" }],
    }),
  ]);
  const metricDefinitions = definitions.map(definitionForCalculation);
  const items = reports.map((report) => {
    const target = {
      businessUnitId: report.businessUnitId,
      departmentId: report.departmentId,
      siteId: report.siteId,
      ownerMembershipId: report.ownerMembershipId,
    };
    return {
      id: report.id,
      reportDate: report.reportDate.toISOString().slice(0, 10),
      marketCode: report.marketCode,
      currency: report.currency,
      note: report.note,
      status: report.status,
      submittedAt: report.submittedAt,
      reviewedAt: report.reviewedAt,
      returnReason: report.returnReason,
      lockedAt: report.lockedAt,
      source: report.source,
      product: report.product,
      department: report.department,
      owner: { membershipId: report.ownerMembershipId, name: report.ownerMembership.user.fullName, username: report.ownerMembership.user.username },
      reviewer: report.reviewedByMembership ? { membershipId: report.reviewedByMembershipId, name: report.reviewedByMembership.user.fullName } : null,
      locker: report.lockedByMembership ? { membershipId: report.lockedByMembershipId, name: report.lockedByMembership.user.fullName } : null,
      metrics: calculateMetrics({ definitions: metricDefinitions, values: report.metricValues }),
      canEdit: ["DRAFT", "RETURNED"].includes(report.status) && updateAccess.allowed && updateAccess.allows(target),
      canReview: report.status === "SUBMITTED" && reviewAccess.allowed && reviewAccess.allows(target),
    };
  });
  const owners = memberships
    .filter((membership) =>
      access.allows({
        businessUnitId: auth.membership.businessUnitId,
        departmentId: membership.departmentId,
        siteId: membership.siteId,
        ownerMembershipId: membership.id,
      }),
    )
    .map((membership) => ({
      membershipId: membership.id,
      name: membership.user.fullName,
      username: membership.user.username,
    }));
  return NextResponse.json({
    ok: true,
    data: items,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      pageCount: Math.ceil(total / pagination.pageSize),
    },
    summary: Object.fromEntries(statusSummary.map((row) => [row.status, row._count._all])),
    filters: { sources, owners },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const createPermission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "marketing.report.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetMembershipId: auth.membership.id,
  });
  if (!createPermission.allowed) return fail("FORBIDDEN", "没有创建投放日报的权限。", 403, { reasons: createPermission.reasons });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "日报内容不正确。", 400, parsed.error.flatten());
  const input = parsed.data;
  const reportDate = asDate(input.reportDate);
  if (!reportDate) return fail("INVALID_DATE", "日报日期不正确。", 400);
  const businessUnitId = auth.membership.businessUnitId;
  const [source, product, definitions] = await Promise.all([
    prisma.marketingSource.findFirst({ where: { id: input.sourceId, businessUnitId, isActive: true } }),
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, businessUnitId, isActive: true }, select: { id: true } }) : null,
    prisma.marketingMetricDefinition.findMany({ where: { businessUnitId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
  ]);
  if (!source) return fail("SOURCE_NOT_FOUND", "投放数据源不存在或未启用。", 400);
  if ((source.departmentId && source.departmentId !== auth.membership.departmentId) || (source.siteId && source.siteId !== auth.membership.siteId)) {
    return fail("SOURCE_OUT_OF_SCOPE", "该投放数据源不在当前岗位范围内。", 403);
  }
  if (input.productId && !product) return fail("PRODUCT_NOT_FOUND", "商品不属于当前业务板块。", 400);
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
  const seenDefinitionIds = new Set<string>();
  const normalized: Array<NormalizedMetricInput | null> = [];
  for (const metric of input.values) {
    if (seenDefinitionIds.has(metric.metricDefinitionId)) return fail("DUPLICATE_METRIC", "同一个指标只能填写一次。", 400);
    seenDefinitionIds.add(metric.metricDefinitionId);
    const definition = definitionMap.get(metric.metricDefinitionId);
    if (!definition) return fail("METRIC_NOT_FOUND", "指标定义不属于当前业务板块。", 400);
    const value = normalizeMetricInput({ definition, value: metric.value });
    if (!value) return fail("METRIC_VALUE_INVALID", `指标“${definition.name}”的值或计算方式不正确。`, 400);
    normalized.push(value);
  }
  const values = normalized.filter((value): value is NormalizedMetricInput => value != null);
  const calculatedDefinitions = definitions.map(definitionForCalculation);
  if (input.submit && !hasRequiredDirectMetrics({ definitions: calculatedDefinitions, inputs: values })) {
    return fail("REQUIRED_METRIC_MISSING", "提交前请填写所有必填的原始指标。", 400);
  }
  if (input.submit) {
    const submitPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "marketing.report.submit",
      targetBusinessUnitId: businessUnitId,
      targetDepartmentId: auth.membership.departmentId,
      targetSiteId: auth.membership.siteId,
      targetMembershipId: auth.membership.id,
    });
    if (!submitPermission.allowed) return fail("FORBIDDEN", "没有提交投放日报的权限。", 403, { reasons: submitPermission.reasons });
  }

  const existing = await prisma.marketingDailyReport.findUnique({
    where: { businessUnitId_ownerMembershipId_sourceId_reportDate: { businessUnitId, ownerMembershipId: auth.membership.id, sourceId: source.id, reportDate } },
    select: { id: true, status: true },
  });
  if (existing && !["DRAFT", "RETURNED"].includes(existing.status)) {
    return fail("REPORT_NOT_EDITABLE", "已提交或已锁定的日报不能由录入人直接修改。", 409);
  }
  if (existing) {
    const updatePermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "marketing.report.update",
      targetBusinessUnitId: businessUnitId,
      targetDepartmentId: auth.membership.departmentId,
      targetSiteId: auth.membership.siteId,
      targetMembershipId: auth.membership.id,
    });
    if (!updatePermission.allowed) return fail("FORBIDDEN", "没有修改该投放日报的权限。", 403, { reasons: updatePermission.reasons });
  }
  const nextStatus = input.submit ? "SUBMITTED" : "DRAFT";
  let report: { id: string; status: "DRAFT" | "SUBMITTED" | "RETURNED" | "LOCKED" } | null;
  try {
    report = await prisma.$transaction(async (tx) => {
      let row: { id: string; status: "DRAFT" | "SUBMITTED" | "RETURNED" | "LOCKED" } | null = null;
    if (existing) {
      // The state predicate prevents a stale browser tab from overwriting a
      // report after a reviewer has already returned or locked it.
      const result = await tx.marketingDailyReport.updateMany({
        where: { id: existing.id, ownerMembershipId: auth.membership.id, status: { in: ["DRAFT", "RETURNED"] } },
        data: {
          productId: input.productId ?? null,
          marketCode: input.marketCode ?? null,
          currency: input.currency,
          note: input.note ?? null,
          status: nextStatus,
          submittedAt: input.submit ? new Date() : null,
          reviewedByMembershipId: null,
          reviewedAt: null,
          returnReason: null,
        },
      });
      if (result.count !== 1) return null;
      row = await tx.marketingDailyReport.findUnique({ where: { id: existing.id } });
    } else {
      row = await tx.marketingDailyReport.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId,
            departmentId: auth.membership.departmentId,
            siteId: auth.membership.siteId,
            sourceId: source.id,
            productId: input.productId ?? null,
            ownerMembershipId: auth.membership.id,
            createdByUserId: auth.userId,
            reportDate,
            marketCode: input.marketCode ?? null,
            currency: input.currency,
            note: input.note ?? null,
            status: nextStatus,
            submittedAt: input.submit ? new Date() : null,
          },
        });
    }
    if (!row) return null;
    await tx.marketingDailyMetricValue.deleteMany({ where: { reportId: row.id } });
    if (values.length) {
      await tx.marketingDailyMetricValue.createMany({ data: values.map((value) => ({ reportId: row.id, ...value })) });
    }
      return row;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("REPORT_CONFLICT", "同一日期和数据源的日报已由另一个窗口创建，请刷新后继续。", 409);
    }
    throw error;
  }
  if (!report) return fail("REPORT_NOT_EDITABLE", "日报状态已变化，请刷新后再操作。", 409);
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.daily_report",
    action: input.submit ? "marketing.report.submit" : existing ? "marketing.report.update" : "marketing.report.create",
    targetType: "marketing_daily_report",
    targetId: report.id,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: { reportDate: input.reportDate, sourceId: source.id, status: nextStatus, metricCount: values.length },
  });
  return ok({ id: report.id, status: report.status });
}
