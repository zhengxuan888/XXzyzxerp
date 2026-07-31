import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, parsePagination } from "@/lib/api-response";
import { parseDateOrNull, resourceAssetInputSchema, safeResourceAuditDetails, toBigIntOrNull } from "@/lib/resource-input";
import { createResourceAccessPlan } from "@/lib/resource-access";
import {
  generateResourceNo,
  resourceAssetInclude,
  resourceTargetOf,
  resolveResourceReferences,
  serializeResource,
} from "@/lib/resource-service";
import { prisma } from "@/lib/prisma";

function optionalText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const [readPlan, accountPlan] = await Promise.all([
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.read" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.read" }),
  ]);
  if (!readPlan.allowed) return fail("FORBIDDEN", "没有查看资源台账的权限。", 403);

  const pagination = parsePagination(request, 100);
  const q = optionalText(request.nextUrl.searchParams.get("q"));
  const categoryId = optionalText(request.nextUrl.searchParams.get("categoryId"));
  const statusId = optionalText(request.nextUrl.searchParams.get("statusId"));
  const departmentId = optionalText(request.nextUrl.searchParams.get("departmentId"));
  const assignedMembershipId = optionalText(request.nextUrl.searchParams.get("assignedMembershipId"));
  const softwareOnly = request.nextUrl.searchParams.get("softwareOnly") === "true";
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

  const scopeWhere = {
    AND: [
      { businessUnitId: auth.membership.businessUnitId },
      readPlan.where,
      ...(includeArchived ? [] : [{ isActive: true }]),
      ...(categoryId ? [{ categoryId }] : []),
      ...(statusId ? [{ statusId }] : []),
      ...(departmentId ? [{ departmentId }] : []),
      ...(assignedMembershipId ? [{ assignedMembershipId }] : []),
      ...(softwareOnly ? [{ category: { isSoftware: true } }] : []),
      ...(q
        ? [{
            OR: [
              { resourceNo: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { brandModel: { contains: q, mode: "insensitive" as const } },
              { serialNumber: { contains: q, mode: "insensitive" as const } },
              { location: { contains: q, mode: "insensitive" as const } },
            ],
          }]
        : []),
    ],
  };
  const summaryWhere = {
    AND: [
      { businessUnitId: auth.membership.businessUnitId, isActive: true },
      readPlan.where,
      ...(softwareOnly ? [{ category: { isSoftware: true } }] : []),
    ],
  };
  const expiresBefore = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [rows, total, totalActive, assignedTotal, expiringSoon, scopedInventory] = await Promise.all([
    prisma.resourceAsset.findMany({
      where: scopeWhere,
      include: resourceAssetInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.resourceAsset.count({ where: scopeWhere }),
    prisma.resourceAsset.count({ where: summaryWhere }),
    prisma.resourceAsset.count({ where: { AND: [summaryWhere, { assignedMembershipId: { not: null } }] } }),
    prisma.resourceAsset.count({ where: { AND: [summaryWhere, { expiresAt: { gte: new Date(), lte: expiresBefore } }] } }),
    prisma.resourceAsset.findMany({
      where: summaryWhere,
      select: { availableQuantity: true, lowStockThreshold: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => serializeResource(row, accountPlan.allows(resourceTargetOf(row)))),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      pageCount: Math.ceil(total / pagination.pageSize),
    },
    summary: {
      total: totalActive,
      assigned: assignedTotal,
      expiringSoon,
      lowStock: scopedInventory.filter((item) => item.availableQuantity <= item.lowStockThreshold).length,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const body = await request.json().catch(() => null);
  const parsed = resourceAssetInputSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_RESOURCE_INPUT", "资源资料不符合要求。", 400, parsed.error.flatten());
  if ((parsed.data.availableQuantity ?? parsed.data.quantity) > parsed.data.quantity) {
    return fail("INVALID_RESOURCE_QUANTITY", "可用数量不能超过总数量。", 400);
  }
  if (
    parsed.data.software
    && parsed.data.software.seatsTotal != null
    && parsed.data.software.seatsUsed != null
    && parsed.data.software.seatsUsed > parsed.data.software.seatsTotal
  ) {
    return fail("INVALID_LICENSE_SEATS", "已使用授权数不能超过总授权数。", 400);
  }

  let purchasedAt: Date | null;
  let expiresAt: Date | null;
  try {
    purchasedAt = parseDateOrNull(parsed.data.purchasedAt, "购置");
    expiresAt = parseDateOrNull(parsed.data.expiresAt, "到期");
  } catch (error) {
    return fail("INVALID_RESOURCE_DATE", error instanceof Error ? error.message : "资源日期格式不正确。", 400);
  }

  let references;
  try {
    references = await resolveResourceReferences({
      auth,
      categoryId: parsed.data.categoryId,
      statusId: parsed.data.statusId,
      departmentId: parsed.data.departmentId ?? null,
      siteId: parsed.data.siteId ?? null,
      assignedMembershipId: parsed.data.assignedMembershipId ?? null,
    });
  } catch (error) {
    return fail("RESOURCE_REFERENCE_INVALID", error instanceof Error ? error.message : "资源归属资料无效。", 400);
  }
  if (parsed.data.software && !references.category.isSoftware) {
    return fail("SOFTWARE_PROFILE_CATEGORY_MISMATCH", "只有标记为软件的资源分类才能填写软件授权资料。", 400);
  }

  const [createPlan, accountManagePlan, accountReadPlan] = await Promise.all([
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.create" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.manage" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.read" }),
  ]);
  const target = {
    businessUnitId: auth.membership.businessUnitId,
    departmentId: references.departmentId,
    siteId: references.siteId,
    assignedMembershipId: references.assignee?.id ?? null,
  };
  if (!createPlan.allowed || !createPlan.allows(target)) {
    return fail("FORBIDDEN", "没有在该组织范围创建资源的权限。", 403);
  }
  if (parsed.data.software?.accountIdentifier && !accountManagePlan.allows(target)) {
    return fail("FORBIDDEN", "没有登记软件账号标识的权限。", 403);
  }

  const resourceNo = parsed.data.resourceNo?.trim() || generateResourceNo();
  try {
    const created = await prisma.$transaction(async (tx) => {
      const resource = await tx.resourceAsset.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          departmentId: references.departmentId,
          siteId: references.siteId,
          categoryId: references.category.id,
          statusId: references.status.id,
          resourceNo,
          name: parsed.data.name,
          brandModel: parsed.data.brandModel ?? null,
          serialNumber: parsed.data.serialNumber ?? null,
          ownership: parsed.data.ownership ?? null,
          location: parsed.data.location ?? null,
          quantity: parsed.data.quantity,
          availableQuantity: parsed.data.availableQuantity ?? parsed.data.quantity,
          lowStockThreshold: parsed.data.lowStockThreshold,
          currency: parsed.data.currency,
          valueCents: toBigIntOrNull(parsed.data.valueCents),
          purchasedAt,
          expiresAt,
          note: parsed.data.note ?? null,
          assignedMembershipId: references.assignee?.id ?? null,
          createdByMembershipId: auth.membership.id,
          softwareProfile: parsed.data.software
            ? {
                create: {
                  platform: parsed.data.software.platform ?? null,
                  accountIdentifier: parsed.data.software.accountIdentifier ?? null,
                  licenseType: parsed.data.software.licenseType ?? null,
                  seatsTotal: parsed.data.software.seatsTotal ?? null,
                  seatsUsed: parsed.data.software.seatsUsed ?? 0,
                  autoRenewal: parsed.data.software.autoRenewal ?? false,
                  renewalCostCents: toBigIntOrNull(parsed.data.software.renewalCostCents),
                  renewalCurrency: parsed.data.software.renewalCurrency ?? parsed.data.currency,
                  renewalCycle: parsed.data.software.renewalCycle ?? null,
                },
              }
            : undefined,
        },
        include: resourceAssetInclude,
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resources",
        action: "resource.create",
        targetType: "resource_asset",
        targetId: resource.id,
        legalEntityId: resource.legalEntityId,
        businessUnitId: resource.businessUnitId,
        roleId: auth.membership.roleId,
        details: safeResourceAuditDetails(parsed.data),
      }, tx);
      return resource;
    });
    return ok(serializeResource(created, accountReadPlan.allows(resourceTargetOf(created))), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源创建失败。";
    if (message.includes("ResourceAsset_businessUnitId_resourceNo_key")) {
      return fail("RESOURCE_NO_CONFLICT", "资源编号已存在，请更换后重试。", 409);
    }
    throw error;
  }
}
