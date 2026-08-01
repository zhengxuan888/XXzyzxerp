import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { aggregateMetricSets, parseDecimal, parseMoneyToCents, type MetricDefinitionInput } from "@/lib/marketing-metrics";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const targetSchema = z.object({
  metricDefinitionId: z.string().uuid(),
  scopeType: z.enum(["BUSINESS_UNIT", "DEPARTMENT", "MEMBERSHIP"]),
  departmentId: z.string().uuid().nullish(),
  membershipId: z.string().uuid().nullish(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  note: z.string().trim().max(1000).nullish(),
});

function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}

function monthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}

function formatDefinition(definition: {
  id: string; code: string; name: string; valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
  aggregation: "SUM" | "AVG" | "LAST"; calculation: "DIRECT" | "RATIO"; numeratorMetricCode: string | null;
  denominatorMetricCode: string | null; multiplier: { toString(): string } | null; inputRequired: boolean; showOnWorkbench: boolean; sortOrder: number; isActive: boolean;
}): MetricDefinitionInput & { aggregation: "SUM" | "AVG" | "LAST" } {
  return {
    ...definition,
    multiplier: definition.multiplier ? new Prisma.Decimal(definition.multiplier.toString()) : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const access = await createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.kpi.read" });
  if (!access.allowed) return fail("FORBIDDEN", "没有查看投放 KPI 的权限。", 403);
  const fromText = request.nextUrl.searchParams.get("dateFrom");
  const toText = request.nextUrl.searchParams.get("dateTo");
  if ((fromText && !date(fromText)) || (toText && !date(toText))) {
    return fail("INVALID_DATE", "日期格式不正确。", 400);
  }
  const defaults = monthRange();
  const dateFrom = fromText ? date(fromText)! : defaults.start;
  const dateTo = toText ? date(toText)! : defaults.end;
  if (dateTo < dateFrom) return fail("INVALID_DATE_RANGE", "结束日期不能早于开始日期。", 400);
  const where: Prisma.MarketingDailyReportWhereInput = {
    AND: [
      access.where,
      { businessUnitId: auth.membership.businessUnitId, reportDate: { gte: dateFrom, lte: dateTo }, status: { in: ["SUBMITTED", "LOCKED"] } },
    ],
  };
  const manageAccessPromise = createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.kpi.manage" });
  const [reports, definitions, targets, departments, memberships, manageAccess] = await Promise.all([
    prisma.marketingDailyReport.findMany({
      where,
      orderBy: [{ reportDate: "asc" }, { id: "asc" }],
      select: { id: true, reportDate: true, currency: true, departmentId: true, ownerMembershipId: true, metricValues: { select: { metricDefinitionId: true, valueCents: true, valueDecimal: true } } },
    }),
    prisma.marketingMetricDefinition.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, valueType: true, aggregation: true, calculation: true, numeratorMetricCode: true, denominatorMetricCode: true, multiplier: true, inputRequired: true, showOnWorkbench: true, sortOrder: true, isActive: true },
    }),
    prisma.marketingKpiTarget.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, periodStart: { lte: dateTo }, periodEnd: { gte: dateFrom } },
      include: { metricDefinition: { select: { code: true, name: true, valueType: true } }, department: { select: { name: true } }, targetMembership: { include: { user: { select: { fullName: true, username: true } } } } },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    }),
    prisma.department.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.membership.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
        isActive: true,
        OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
      },
      select: { id: true, departmentId: true, siteId: true, user: { select: { fullName: true, username: true } } },
      orderBy: [{ user: { fullName: "asc" } }, { id: "asc" }],
    }),
    manageAccessPromise,
  ]);
  const metricDefinitions = definitions.map(formatDefinition);
  const byCurrency = new Map<string, typeof reports>();
  for (const report of reports) byCurrency.set(report.currency, [...(byCurrency.get(report.currency) ?? []), report]);
  const summaries = [...byCurrency.entries()].map(([currency, currencyReports]) => ({
    currency,
    reportCount: currencyReports.length,
    metrics: aggregateMetricSets({ definitions: metricDefinitions, valueSets: currencyReports.map((report) => report.metricValues) }),
  }));

  const visibility = await Promise.all(targets.map(async (target) => {
    const decision = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "marketing.kpi.read",
      targetBusinessUnitId: target.businessUnitId,
      targetDepartmentId: target.departmentId,
      targetMembershipId: target.targetMembershipId,
      ...(target.scopeType === "BUSINESS_UNIT" ? { allowedScopes: ["ALL", "BUSINESS_UNIT"] as const } : {}),
    });
    return { target, allowed: decision.allowed };
  }));
  const visibleTargets = visibility.filter((row) => row.allowed).map(({ target }) => {
    const effectiveStart = target.periodStart > dateFrom ? target.periodStart : dateFrom;
    const effectiveEnd = target.periodEnd < dateTo ? target.periodEnd : dateTo;
    const scopedReports = effectiveEnd < effectiveStart
      ? []
      : reports.filter((report) => {
          if (report.currency !== target.currency || report.reportDate < effectiveStart || report.reportDate > effectiveEnd) return false;
          if (target.scopeType === "DEPARTMENT") return report.departmentId === target.departmentId;
          if (target.scopeType === "MEMBERSHIP") return report.ownerMembershipId === target.targetMembershipId;
          return true;
        });
    const actualMetric = aggregateMetricSets({
      definitions: metricDefinitions,
      valueSets: scopedReports.map((report) => report.metricValues),
    }).find((metric) => metric.id === target.metricDefinitionId) ?? null;
    const targetValue = target.targetCents != null
      ? new Prisma.Decimal(target.targetCents.toString())
      : target.targetDecimal != null
        ? new Prisma.Decimal(target.targetDecimal.toString())
        : null;
    const actualValue = actualMetric?.valueCents != null
      ? new Prisma.Decimal(actualMetric.valueCents)
      : actualMetric?.valueDecimal != null
        ? new Prisma.Decimal(actualMetric.valueDecimal)
        : new Prisma.Decimal(0);
    const achievementPercent = targetValue && !targetValue.isZero()
      ? actualValue.dividedBy(targetValue).mul(100).toDecimalPlaces(2).toString()
      : null;
    return {
      id: target.id,
      metric: target.metricDefinition,
      scopeType: target.scopeType,
      department: target.department,
      membership: target.targetMembership ? { id: target.targetMembershipId, name: target.targetMembership.user.fullName, username: target.targetMembership.user.username } : null,
      periodStart: target.periodStart.toISOString().slice(0, 10),
      periodEnd: target.periodEnd.toISOString().slice(0, 10),
      actualPeriodStart: effectiveStart.toISOString().slice(0, 10),
      actualPeriodEnd: effectiveEnd.toISOString().slice(0, 10),
      targetCents: target.targetCents?.toString() ?? null,
      targetDecimal: target.targetDecimal?.toString() ?? null,
      actualCents: actualMetric?.valueCents ?? null,
      actualDecimal: actualMetric?.valueCents == null ? actualMetric?.valueDecimal ?? "0" : null,
      achievementPercent,
      reportCount: scopedReports.length,
      currency: target.currency,
      note: target.note,
    };
  });
  const scopeOptions = {
    businessUnit: manageAccess.allowed && manageAccess.allows({
      businessUnitId: auth.membership.businessUnitId,
      departmentId: null,
      siteId: null,
      ownerMembershipId: auth.membership.id,
    }),
    departments: departments
      .filter((department) => manageAccess.allowed && manageAccess.allows({
        businessUnitId: auth.membership.businessUnitId,
        departmentId: department.id,
        siteId: null,
        ownerMembershipId: auth.membership.id,
      }))
      .map(({ id, name }) => ({ id, name })),
    memberships: memberships
      .filter((membership) => manageAccess.allowed && manageAccess.allows({
        businessUnitId: auth.membership.businessUnitId,
        departmentId: membership.departmentId,
        siteId: membership.siteId,
        ownerMembershipId: membership.id,
      }))
      .map((membership) => ({ id: membership.id, name: membership.user.fullName, username: membership.user.username, departmentId: membership.departmentId })),
  };
  return ok({
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
    summaries,
    metricDefinitions: metricDefinitions.map((definition) => ({ ...definition, multiplier: definition.multiplier?.toString() ?? null })),
    targets: visibleTargets,
    scopeOptions,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const parsed = targetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "KPI 目标内容不正确。", 400, parsed.error.flatten());
  const input = parsed.data;
  const periodStart = date(input.periodStart);
  const periodEnd = date(input.periodEnd);
  if (!periodStart || !periodEnd) return fail("INVALID_DATE", "KPI 目标日期不正确。", 400);
  if (periodEnd < periodStart) return fail("INVALID_DATE_RANGE", "结束日期不能早于开始日期。", 400);
  const businessUnitId = auth.membership.businessUnitId;
  const [metric, department, membership] = await Promise.all([
    prisma.marketingMetricDefinition.findFirst({ where: { id: input.metricDefinitionId, businessUnitId, isActive: true } }),
    input.departmentId ? prisma.department.findFirst({ where: { id: input.departmentId, businessUnitId, isActive: true } }) : null,
    input.membershipId ? prisma.membership.findFirst({ where: { id: input.membershipId, businessUnitId, isActive: true } }) : null,
  ]);
  if (!metric) return fail("METRIC_NOT_FOUND", "指标定义不存在。", 404);
  if (input.scopeType === "DEPARTMENT" && (!input.departmentId || !department)) return fail("DEPARTMENT_REQUIRED", "部门目标必须选择当前业务板块内的部门。", 400);
  if (input.scopeType === "MEMBERSHIP" && (!input.membershipId || !membership)) return fail("MEMBERSHIP_REQUIRED", "员工目标必须选择当前业务板块内的员工。", 400);
  if (input.scopeType === "BUSINESS_UNIT" && (input.departmentId || input.membershipId)) return fail("SCOPE_INVALID", "业务板块目标不能携带部门或员工。", 400);
  const targetDepartmentId = input.scopeType === "DEPARTMENT" ? department!.id : input.scopeType === "MEMBERSHIP" ? membership!.departmentId : null;
  const targetMembershipId = input.scopeType === "MEMBERSHIP" ? membership!.id : null;
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "marketing.kpi.manage",
    targetBusinessUnitId: businessUnitId,
    targetDepartmentId,
    targetMembershipId,
    ...(input.scopeType === "BUSINESS_UNIT" ? { allowedScopes: ["ALL", "BUSINESS_UNIT"] as const } : {}),
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置该范围 KPI 的权限。", 403, { reasons: permission.reasons });
  const valueCents = metric.valueType === "MONEY_CENTS" ? parseMoneyToCents(input.value) : null;
  const valueDecimal = metric.valueType === "MONEY_CENTS" ? null : parseDecimal(input.value);
  if ((metric.valueType === "MONEY_CENTS" && valueCents == null) || (metric.valueType !== "MONEY_CENTS" && valueDecimal == null)) {
    return fail("TARGET_VALUE_INVALID", "目标值格式不正确。", 400);
  }
  const scopeKey = input.scopeType === "BUSINESS_UNIT" ? businessUnitId : input.scopeType === "DEPARTMENT" ? department!.id : membership!.id;
  const target = await prisma.marketingKpiTarget.upsert({
    where: { businessUnitId_metricDefinitionId_scopeType_scopeKey_periodStart_periodEnd: { businessUnitId, metricDefinitionId: metric.id, scopeType: input.scopeType, scopeKey, periodStart, periodEnd } },
    update: { departmentId: targetDepartmentId, targetMembershipId, targetCents: valueCents, targetDecimal: valueDecimal, currency: input.currency, note: input.note ?? null, setByMembershipId: auth.membership.id },
    create: { legalEntityId: auth.membership.legalEntityId, businessUnitId, departmentId: targetDepartmentId, targetMembershipId, metricDefinitionId: metric.id, scopeType: input.scopeType, scopeKey, periodStart, periodEnd, targetCents: valueCents, targetDecimal: valueDecimal, currency: input.currency, note: input.note ?? null, setByMembershipId: auth.membership.id },
    select: { id: true },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.kpi",
    action: "marketing.kpi.manage",
    targetType: "marketing_kpi_target",
    targetId: target.id,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: { metricDefinitionId: metric.id, scopeType: input.scopeType, scopeKey, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });
  return ok(target);
}
