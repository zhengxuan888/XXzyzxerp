import { NextRequest } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { parseDecimal } from "@/lib/marketing-metrics";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const codeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const idSchema = z.string().uuid();
const scopeConfigScopes = ["ALL", "BUSINESS_UNIT"] as const;

const sourceSchema = z.object({
  kind: z.literal("source"),
  id: idSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
  sourceKind: z.string().trim().min(1).max(40).default("SOURCE"),
  parentId: idSchema.nullish(),
  departmentId: idSchema.nullish(),
  siteId: idSchema.nullish(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

const metricSchema = z.object({
  kind: z.literal("metric"),
  id: idSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
  valueType: z.enum(["COUNT", "MONEY_CENTS", "DECIMAL", "PERCENT"]),
  aggregation: z.enum(["SUM", "AVG", "LAST"]).default("SUM"),
  calculation: z.enum(["DIRECT", "RATIO"]).default("DIRECT"),
  numeratorMetricCode: codeSchema.nullish(),
  denominatorMetricCode: codeSchema.nullish(),
  multiplier: z.string().trim().nullish(),
  inputRequired: z.boolean().default(false),
  showOnWorkbench: z.boolean().default(false),
  description: z.string().trim().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

const creativeStatusSchema = z.object({
  kind: z.literal("creativeStatus"),
  id: idSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).nullish(),
  isTerminal: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

const tagSchema = z.object({
  kind: z.literal("tag"),
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

const writeSchema = z.discriminatedUnion("kind", [sourceSchema, metricSchema, creativeStatusSchema, tagSchema]);

async function canRead(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>, actionKey: string) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
}

async function canConfigure(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>, actionKey: string) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
    allowedScopes: scopeConfigScopes,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const [sourceRead, metricRead, creativeRead, configure] = await Promise.all([
    canRead(auth, "marketing.source.read"),
    canRead(auth, "marketing.metric.read"),
    canRead(auth, "marketing.creative.read"),
    canConfigure(auth, "marketing.workbench.configure"),
  ]);
  if (![sourceRead, metricRead, creativeRead, configure].some((permission) => permission.allowed)) {
    return fail("FORBIDDEN", "没有查看投放配置的权限。", 403);
  }
  const businessUnitId = auth.membership.businessUnitId;
  const [sources, metrics, statuses, tags, departments, sites] = await Promise.all([
    sourceRead.allowed || configure.allowed
      ? prisma.marketingSource.findMany({
          where: { businessUnitId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, code: true, name: true, kind: true, parentId: true, departmentId: true, siteId: true, sortOrder: true, isActive: true },
        })
      : [],
    metricRead.allowed || configure.allowed
      ? prisma.marketingMetricDefinition.findMany({
          where: { businessUnitId },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          select: {
            id: true, code: true, name: true, valueType: true, aggregation: true, calculation: true,
            numeratorMetricCode: true, denominatorMetricCode: true, multiplier: true, inputRequired: true,
            showOnWorkbench: true, description: true, sortOrder: true, isActive: true,
          },
        })
      : [],
    sourceRead.allowed || metricRead.allowed || creativeRead.allowed || configure.allowed
      ? prisma.marketingCreativeStatus.findMany({
          where: { businessUnitId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      : [],
    sourceRead.allowed || metricRead.allowed || creativeRead.allowed || configure.allowed
      ? prisma.marketingTag.findMany({
          where: { businessUnitId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      : [],
    prisma.department.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.site.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" } }),
  ]);
  return ok({
    sources,
    metrics: metrics.map((metric) => ({ ...metric, multiplier: metric.multiplier?.toString() ?? null })),
    statuses,
    tags,
    departments,
    sites,
    permissions: {
      canConfigure: configure.allowed,
      canManageSources: (await canConfigure(auth, "marketing.source.manage")).allowed,
      canManageMetrics: (await canConfigure(auth, "marketing.metric.manage")).allowed,
      canManageTags: (await canConfigure(auth, "marketing.creative.tag.manage")).allowed,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const parsed = writeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "配置内容不正确。", 400, parsed.error.flatten());
  const input = parsed.data;
  const actionKey = input.kind === "source"
    ? "marketing.source.manage"
    : input.kind === "metric"
      ? "marketing.metric.manage"
      : input.kind === "tag"
        ? "marketing.creative.tag.manage"
        : "marketing.workbench.configure";
  const permission = await canConfigure(auth, actionKey);
  if (!permission.allowed) return fail("FORBIDDEN", "没有修改该投放配置的权限。", 403, { reasons: permission.reasons });

  const businessUnitId = auth.membership.businessUnitId;
  const legalEntityId = auth.membership.legalEntityId;
  let record: { id: string };
  let targetType: string;
  if (input.kind === "source") {
    if (input.parentId) {
      const parent = await prisma.marketingSource.findFirst({ where: { id: input.parentId, businessUnitId }, select: { id: true } });
      if (!parent) return fail("PARENT_SOURCE_NOT_FOUND", "上级数据源不属于当前业务板块。", 400);
    }
    const [department, site] = await Promise.all([
      input.departmentId ? prisma.department.findFirst({ where: { id: input.departmentId, businessUnitId, isActive: true }, select: { id: true } }) : null,
      input.siteId ? prisma.site.findFirst({ where: { id: input.siteId, businessUnitId, isActive: true }, select: { id: true } }) : null,
    ]);
    if (input.departmentId && !department) return fail("DEPARTMENT_NOT_FOUND", "部门不属于当前业务板块。", 400);
    if (input.siteId && !site) return fail("SITE_NOT_FOUND", "站点不属于当前业务板块。", 400);
    if (input.id) {
      const existing = await prisma.marketingSource.findFirst({ where: { id: input.id, businessUnitId }, select: { id: true } });
      if (!existing) return fail("SOURCE_NOT_FOUND", "数据源不存在。", 404);
      record = await prisma.marketingSource.update({ where: { id: input.id }, data: { code: input.code, name: input.name, kind: input.sourceKind, parentId: input.parentId ?? null, departmentId: input.departmentId ?? null, siteId: input.siteId ?? null, sortOrder: input.sortOrder, isActive: input.isActive }, select: { id: true } });
    } else {
      record = await prisma.marketingSource.upsert({
        where: { businessUnitId_code: { businessUnitId, code: input.code } },
        update: { name: input.name, kind: input.sourceKind, parentId: input.parentId ?? null, departmentId: input.departmentId ?? null, siteId: input.siteId ?? null, sortOrder: input.sortOrder, isActive: input.isActive },
        create: { legalEntityId, businessUnitId, code: input.code, name: input.name, kind: input.sourceKind, parentId: input.parentId ?? null, departmentId: input.departmentId ?? null, siteId: input.siteId ?? null, sortOrder: input.sortOrder, isActive: input.isActive },
        select: { id: true },
      });
    }
    targetType = "marketing_source";
  } else if (input.kind === "metric") {
    const configuredMetrics = await prisma.marketingMetricDefinition.findMany({
      where: { businessUnitId },
      select: { id: true, code: true, calculation: true, isActive: true },
    });
    const existingMetric = input.id ? configuredMetrics.find((metric) => metric.id === input.id) ?? null : null;
    if (input.id && !existingMetric) return fail("METRIC_NOT_FOUND", "指标定义不存在。", 404);
    // Formula references and KPI targets use stable metric codes. Renaming one
    // would silently break stored formula dependencies, so create a new metric
    // and retire the old definition instead.
    if (existingMetric && existingMetric.code !== input.code) {
      return fail("METRIC_CODE_IMMUTABLE", "已使用的指标编码不能直接修改；请新建指标并停用旧指标。", 409);
    }
    const multiplier = input.calculation === "RATIO" ? parseDecimal(input.multiplier) : null;
    if (input.calculation === "RATIO" && (!input.numeratorMetricCode || !input.denominatorMetricCode || !multiplier || multiplier.lte(0))) {
      return fail("METRIC_FORMULA_INVALID", "比例指标必须配置有效的分子、分母和正数倍数。", 400);
    }
    if (input.calculation === "RATIO") {
      const references = [input.numeratorMetricCode!, input.denominatorMetricCode!];
      const byCode = new Map(configuredMetrics.map((metric) => [metric.code, metric]));
      const invalidReference = references.some((code) => {
        const metric = byCode.get(code);
        return code === input.code || !metric || !metric.isActive || metric.calculation !== "DIRECT";
      });
      if (invalidReference) {
        return fail("METRIC_FORMULA_REFERENCE_INVALID", "比例指标只能引用当前业务板块中已启用的直接录入指标，且不能自引用或引用派生指标。", 400);
      }
    }
    if (input.calculation === "DIRECT" && (input.numeratorMetricCode || input.denominatorMetricCode || input.multiplier)) {
      return fail("METRIC_FORMULA_INVALID", "直接录入指标不能填写比例公式。", 400);
    }
    const data = {
      code: input.code,
      name: input.name,
      valueType: input.valueType,
      aggregation: input.aggregation,
      calculation: input.calculation,
      numeratorMetricCode: input.calculation === "RATIO" ? input.numeratorMetricCode ?? null : null,
      denominatorMetricCode: input.calculation === "RATIO" ? input.denominatorMetricCode ?? null : null,
      multiplier: input.calculation === "RATIO" ? multiplier : null,
      inputRequired: input.calculation === "DIRECT" && input.inputRequired,
      showOnWorkbench: input.showOnWorkbench,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    };
    if (input.id) {
      const existing = await prisma.marketingMetricDefinition.findFirst({ where: { id: input.id, businessUnitId }, select: { id: true } });
      if (!existing) return fail("METRIC_NOT_FOUND", "指标定义不存在。", 404);
      record = await prisma.marketingMetricDefinition.update({ where: { id: input.id }, data, select: { id: true } });
    } else {
      record = await prisma.marketingMetricDefinition.upsert({ where: { businessUnitId_code: { businessUnitId, code: input.code } }, update: data, create: { legalEntityId, businessUnitId, ...data }, select: { id: true } });
    }
    targetType = "marketing_metric_definition";
  } else if (input.kind === "creativeStatus") {
    const data = { code: input.code, name: input.name, color: input.color ?? null, isTerminal: input.isTerminal, sortOrder: input.sortOrder, isActive: input.isActive };
    if (input.id) {
      const existing = await prisma.marketingCreativeStatus.findFirst({ where: { id: input.id, businessUnitId }, select: { id: true } });
      if (!existing) return fail("STATUS_NOT_FOUND", "素材状态不存在。", 404);
      record = await prisma.marketingCreativeStatus.update({ where: { id: input.id }, data, select: { id: true } });
    } else {
      record = await prisma.marketingCreativeStatus.upsert({ where: { businessUnitId_code: { businessUnitId, code: input.code } }, update: data, create: { legalEntityId, businessUnitId, ...data }, select: { id: true } });
    }
    targetType = "marketing_creative_status";
  } else {
    const data = { name: input.name, color: input.color ?? null, sortOrder: input.sortOrder, isActive: input.isActive };
    if (input.id) {
      const existing = await prisma.marketingTag.findFirst({ where: { id: input.id, businessUnitId }, select: { id: true } });
      if (!existing) return fail("TAG_NOT_FOUND", "素材标签不存在。", 404);
      record = await prisma.marketingTag.update({ where: { id: input.id }, data, select: { id: true } });
    } else {
      record = await prisma.marketingTag.upsert({ where: { businessUnitId_name: { businessUnitId, name: input.name } }, update: data, create: { legalEntityId, businessUnitId, ...data }, select: { id: true } });
    }
    targetType = "marketing_tag";
  }

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.configuration",
    action: actionKey,
    targetType,
    targetId: record.id,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: { kind: input.kind, id: record.id, code: "code" in input ? input.code : undefined, isActive: input.isActive },
  });
  return ok({ id: record.id });
}
