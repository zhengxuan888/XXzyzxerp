import { NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createMarketingCreativeAccessPlan, createMarketingReportAccessPlan } from "@/lib/marketing-access";
import { aggregateMetricSets, type MetricDefinitionInput } from "@/lib/marketing-metrics";
import { marketingWorkbenchCardAppliesToMembership, parseMarketingWorkbenchConfig, type MarketingWorkbenchCard } from "@/lib/marketing-workbench-config";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

function dayFromQuery(value: string | null) {
  if (!value) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}

function dayBounds(day: Date) {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function definitionForAggregation(definition: {
  id: string; code: string; name: string; valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
  aggregation: "SUM" | "AVG" | "LAST"; calculation: "DIRECT" | "RATIO";
  numeratorMetricCode: string | null; denominatorMetricCode: string | null;
  multiplier: { toString(): string } | null; inputRequired: boolean; showOnWorkbench: boolean; sortOrder: number; isActive: boolean;
}): MetricDefinitionInput & { aggregation: "SUM" | "AVG" | "LAST" } {
  return {
    ...definition,
    multiplier: definition.multiplier ? new Prisma.Decimal(definition.multiplier.toString()) : null,
  };
}

async function canUseWorkbench(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "marketing.workbench.view",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetMembershipId: auth.membership.id,
  });
}

type WorkbenchCardResponse = MarketingWorkbenchCard & {
  value: string | number | null;
  valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT" | null;
  isDerived: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const workbenchPermission = await canUseWorkbench(auth);
  if (!workbenchPermission.allowed) return fail("FORBIDDEN", "没有查看投放运营工作台的权限。", 403, { reasons: workbenchPermission.reasons });

  const requestedDay = dayFromQuery(request.nextUrl.searchParams.get("date"));
  if (!requestedDay) return fail("INVALID_DATE", "工作台日期不正确。", 400);
  const { start, end } = dayBounds(requestedDay);
  const businessUnitId = auth.membership.businessUnitId;
  const requestedCurrency = request.nextUrl.searchParams.get("currency")?.trim().toUpperCase() ?? "";
  if (requestedCurrency && !/^[A-Z]{3}$/.test(requestedCurrency)) return fail("INVALID_CURRENCY", "币种格式不正确。", 400);
  const [setting, reportRead, reportReview, creativeRead] = await Promise.all([
    prisma.marketingWorkbenchSetting.findUnique({ where: { businessUnitId } }),
    createMarketingReportAccessPlan({ membership: auth.membership }),
    createMarketingReportAccessPlan({ membership: auth.membership, actionKey: "marketing.report.review" }),
    createMarketingCreativeAccessPlan({ membership: auth.membership }),
  ]);
  const config = parseMarketingWorkbenchConfig(setting);
  const visibleCards = config.cards.filter((card) => card.isVisible && marketingWorkbenchCardAppliesToMembership(card, auth.membership));
  const needsReportData = visibleCards.some((card) =>
    card.kind === "METRIC" || card.queueKey === "MY_DRAFT_REPORTS" || card.queueKey === "RETURNED_REPORTS",
  );
  const needsCreativeData = visibleCards.some((card) => card.queueKey === "MY_CREATIVES");
  const [definitions, reports, myDrafts, returnedReports, pendingReview, myCreatives] = await Promise.all([
    needsReportData && reportRead.allowed
      ? prisma.marketingMetricDefinition.findMany({
          where: { businessUnitId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          select: {
            id: true, code: true, name: true, valueType: true, aggregation: true, calculation: true,
            numeratorMetricCode: true, denominatorMetricCode: true, multiplier: true, inputRequired: true,
            showOnWorkbench: true, sortOrder: true, isActive: true,
          },
        })
      : [],
    needsReportData && reportRead.allowed
      ? prisma.marketingDailyReport.findMany({
          where: {
            AND: [
              reportRead.where,
              { businessUnitId, reportDate: { gte: start, lt: end }, status: { in: ["SUBMITTED", "LOCKED"] } },
            ],
          },
          orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { currency: true, metricValues: { select: { metricDefinitionId: true, valueCents: true, valueDecimal: true } } },
        })
      : [],
    needsReportData && reportRead.allowed
      ? prisma.marketingDailyReport.count({ where: { AND: [reportRead.where, { businessUnitId, ownerMembershipId: auth.membership.id, status: "DRAFT" }] } })
      : 0,
    needsReportData && reportRead.allowed
      ? prisma.marketingDailyReport.count({ where: { AND: [reportRead.where, { businessUnitId, ownerMembershipId: auth.membership.id, status: "RETURNED" }] } })
      : 0,
    visibleCards.some((card) => card.queueKey === "PENDING_REVIEW") && reportReview.allowed
      ? prisma.marketingDailyReport.count({ where: { AND: [reportReview.where, { businessUnitId, status: "SUBMITTED" }] } })
      : 0,
    needsCreativeData && creativeRead.allowed
      ? prisma.marketingCreative.count({ where: { AND: [creativeRead.where, { businessUnitId, ownerMembershipId: auth.membership.id, isArchived: false }] } })
      : 0,
  ]);
  const currencyChoices = [...new Set(reports.map((report) => report.currency))].sort();
  const currency = requestedCurrency && currencyChoices.includes(requestedCurrency)
    ? requestedCurrency
    : currencyChoices.length === 1 ? currencyChoices[0] : null;
  // Never add monetary facts from different currencies together. When more
  // than one currency exists, the caller must choose one before metrics show.
  const metricReports = currency ? reports.filter((report) => report.currency === currency) : [];
  const metrics = aggregateMetricSets({
    definitions: definitions.map(definitionForAggregation),
    valueSets: metricReports.map((report) => report.metricValues),
  });
  const metricsByCode = new Map(metrics.map((metric) => [metric.code, metric]));
  const queues = {
    MY_DRAFT_REPORTS: myDrafts,
    RETURNED_REPORTS: returnedReports,
    PENDING_REVIEW: pendingReview,
    MY_CREATIVES: myCreatives,
  };

  const actionChecks = await Promise.all(visibleCards.map(async (card) => {
    if (!card.actionKey) return [card.key, false] as const;
    if (card.kind === "QUEUE" && card.queueKey === "PENDING_REVIEW") return [card.key, reportReview.allowed] as const;
    if (card.kind === "QUEUE" && card.queueKey === "MY_CREATIVES") return [card.key, creativeRead.allowed] as const;
    if (card.kind === "QUEUE") return [card.key, reportRead.allowed] as const;
    if (card.kind === "METRIC") return [card.key, reportRead.allowed] as const;
    const decision = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: card.actionKey,
      targetBusinessUnitId: businessUnitId,
      targetDepartmentId: auth.membership.departmentId,
      targetSiteId: auth.membership.siteId,
      targetMembershipId: auth.membership.id,
    });
    return [card.key, decision.allowed] as const;
  }));
  const actionAllowed = new Map(actionChecks);

  const cards: WorkbenchCardResponse[] = [];
  for (const card of visibleCards) {
    if (!actionAllowed.get(card.key)) continue;
    if (card.kind === "METRIC") {
      const metric = card.metricCode ? metricsByCode.get(card.metricCode) : null;
      if (!metric) continue;
      cards.push({ ...card, value: metric.valueCents ?? metric.valueDecimal ?? "—", valueType: metric.valueType, isDerived: metric.isDerived });
      continue;
    }
    if (card.kind === "QUEUE") {
      const key = card.queueKey;
      if (!key) continue;
      cards.push({ ...card, value: queues[key], valueType: "COUNT", isDerived: false });
      continue;
    }
    cards.push({ ...card, value: null, valueType: null, isDerived: false });
  }

  return ok({
    date: start.toISOString().slice(0, 10),
    currency,
    currencyChoices,
    cards,
    summary: {
      submittedReports: reports.length,
      returnedReports,
      pendingReview,
    },
  });
}
