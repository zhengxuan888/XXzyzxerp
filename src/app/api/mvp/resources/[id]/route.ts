import { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { parseDateOrNull, resourceAssetPatchSchema, toBigIntOrNull } from "@/lib/resource-input";
import { createResourceAccessPlan } from "@/lib/resource-access";
import {
  resourceAssetInclude,
  resourceTargetOf,
  resolveResourceReferences,
  serializeResource,
} from "@/lib/resource-service";
import { prisma } from "@/lib/prisma";

async function findAsset(id: string, businessUnitId: string) {
  return prisma.resourceAsset.findFirst({
    where: { id, businessUnitId },
    include: {
      ...resourceAssetInclude,
      lifecycleEvents: {
        include: {
          lifecycleAction: { select: { id: true, code: true, name: true } },
          fromStatus: { select: { id: true, name: true } },
          toStatus: { select: { id: true, name: true } },
          performedByMembership: { select: { user: { select: { username: true, fullName: true } } } },
          fromAssigneeMembership: { select: { user: { select: { username: true, fullName: true } } } },
          toAssigneeMembership: { select: { user: { select: { username: true, fullName: true } } } },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 100,
      },
    },
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const [asset, readPlan, accountPlan, lifecycleHistoryPlan] = await Promise.all([
    findAsset(id, auth.membership.businessUnitId),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.read" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.read" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.lifecycle.history.read" }),
  ]);
  if (!asset || !readPlan.allowed || !readPlan.allows(resourceTargetOf(asset))) {
    return fail("NOT_FOUND", "资源不存在或无权查看。", 404);
  }
  const visibleLifecycleEvents = lifecycleHistoryPlan.allowed
    ? asset.lifecycleEvents.filter((event) => lifecycleHistoryPlan.allows({
        businessUnitId: event.businessUnitId,
        departmentId: event.departmentId,
        siteId: event.siteId,
        assignedMembershipId: event.toAssigneeMembershipId ?? event.fromAssigneeMembershipId,
      }))
    : [];
  return ok({
    ...serializeResource(asset, accountPlan.allows(resourceTargetOf(asset))),
    lifecycleEvents: visibleLifecycleEvents,
    lifecycleHistoryRestricted: visibleLifecycleEvents.length < asset.lifecycleEvents.length,
  });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = resourceAssetPatchSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_RESOURCE_INPUT", "资源资料不符合要求。", 400, parsed.error.flatten());
  if (!Object.keys(parsed.data).length) return fail("RESOURCE_UPDATE_EMPTY", "没有可更新的资源字段。", 400);
  if (
    parsed.data.statusId !== undefined
    || parsed.data.assignedMembershipId !== undefined
    || parsed.data.departmentId !== undefined
    || parsed.data.siteId !== undefined
  ) {
    return fail("RESOURCE_LIFECYCLE_REQUIRED", "资源状态、领用人和组织归属必须通过流转操作修改，确保历史可追溯。", 409);
  }

  const current = await findAsset(id, auth.membership.businessUnitId);
  if (!current) return fail("NOT_FOUND", "资源不存在。", 404);
  const [updatePlan, accountReadPlan, accountManagePlan] = await Promise.all([
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.update" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.read" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.manage" }),
  ]);
  if (!updatePlan.allowed || !updatePlan.allows(resourceTargetOf(current))) {
    return fail("FORBIDDEN", "没有编辑该资源的权限。", 403);
  }

  const nextQuantity = parsed.data.quantity ?? current.quantity;
  const nextAvailableQuantity = parsed.data.availableQuantity ?? current.availableQuantity;
  if (nextAvailableQuantity > nextQuantity) return fail("INVALID_RESOURCE_QUANTITY", "可用数量不能超过总数量。", 400);
  const nextCategoryId = parsed.data.categoryId ?? current.categoryId;
  const nextStatusId = current.statusId;
  const nextDepartmentId = parsed.data.departmentId === undefined ? current.departmentId : parsed.data.departmentId;
  const nextSiteId = parsed.data.siteId === undefined ? current.siteId : parsed.data.siteId;
  let references;
  try {
    references = await resolveResourceReferences({
      auth,
      categoryId: nextCategoryId,
      statusId: nextStatusId,
      departmentId: nextDepartmentId,
      siteId: nextSiteId,
      assignedMembershipId: current.assignedMembershipId,
      requireActiveCategoryAndStatus: false,
    });
  } catch (error) {
    return fail("RESOURCE_REFERENCE_INVALID", error instanceof Error ? error.message : "资源归属资料无效。", 400);
  }
  const nextTarget = {
    businessUnitId: auth.membership.businessUnitId,
    departmentId: references.departmentId,
    siteId: references.siteId,
    assignedMembershipId: current.assignedMembershipId,
  };
  if (!updatePlan.allows(nextTarget)) return fail("FORBIDDEN", "不能把资源转移到无权管理的组织范围。", 403);
  if (parsed.data.software && !references.category.isSoftware) {
    return fail("SOFTWARE_PROFILE_CATEGORY_MISMATCH", "只有标记为软件的资源分类才能填写软件授权资料。", 400);
  }
  const nextProfile = parsed.data.software;
  if (!references.category.isSoftware && current.softwareProfile && nextProfile !== null) {
    return fail("SOFTWARE_PROFILE_CATEGORY_MISMATCH", "将软件资产改为非软件分类前，必须先明确删除软件授权资料。", 409);
  }
  const nextSeatsTotal = nextProfile === undefined
    ? current.softwareProfile?.seatsTotal ?? null
    : nextProfile?.seatsTotal === undefined
      ? current.softwareProfile?.seatsTotal ?? null
      : nextProfile.seatsTotal;
  const nextSeatsUsed = nextProfile === undefined
    ? current.softwareProfile?.seatsUsed ?? 0
    : nextProfile?.seatsUsed === undefined
      ? current.softwareProfile?.seatsUsed ?? 0
      : nextProfile.seatsUsed ?? 0;
  if (nextProfile && nextSeatsTotal != null && nextSeatsUsed > nextSeatsTotal) {
    return fail("INVALID_LICENSE_SEATS", "已使用授权数不能超过总授权数。", 400);
  }

  let nextPurchasedAt: Date | null;
  let nextExpiresAt: Date | null;
  try {
    nextPurchasedAt = parsed.data.purchasedAt === undefined
      ? current.purchasedAt
      : parseDateOrNull(parsed.data.purchasedAt, "购置");
    nextExpiresAt = parsed.data.expiresAt === undefined
      ? current.expiresAt
      : parseDateOrNull(parsed.data.expiresAt, "到期");
  } catch (error) {
    return fail("INVALID_RESOURCE_DATE", error instanceof Error ? error.message : "资源日期格式不正确。", 400);
  }
  if (nextProfile?.accountIdentifier !== undefined && !accountManagePlan.allows(nextTarget)) {
    return fail("FORBIDDEN", "没有修改软件账号标识的权限。", 403);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const mutation = await tx.resourceAsset.updateMany({
        where: {
          id: current.id,
          businessUnitId: current.businessUnitId,
          version: current.version,
        },
        data: {
          resourceNo: parsed.data.resourceNo?.trim() || current.resourceNo,
          name: parsed.data.name ?? current.name,
          categoryId: nextCategoryId,
          departmentId: references.departmentId,
          siteId: references.siteId,
          brandModel: parsed.data.brandModel === undefined ? current.brandModel : parsed.data.brandModel,
          serialNumber: parsed.data.serialNumber === undefined ? current.serialNumber : parsed.data.serialNumber,
          ownership: parsed.data.ownership === undefined ? current.ownership : parsed.data.ownership,
          location: parsed.data.location === undefined ? current.location : parsed.data.location,
          quantity: nextQuantity,
          availableQuantity: nextAvailableQuantity,
          lowStockThreshold: parsed.data.lowStockThreshold ?? current.lowStockThreshold,
          currency: parsed.data.currency ?? current.currency,
          valueCents: parsed.data.valueCents === undefined ? current.valueCents : toBigIntOrNull(parsed.data.valueCents),
          purchasedAt: nextPurchasedAt,
          expiresAt: nextExpiresAt,
          note: parsed.data.note === undefined ? current.note : parsed.data.note,
          version: { increment: 1 },
        },
      });
      if (mutation.count !== 1) throw new Error("RESOURCE_VERSION_CONFLICT");

      if (nextProfile === null) {
        await tx.softwareAssetProfile.deleteMany({ where: { resourceAssetId: current.id } });
      } else if (nextProfile) {
        await tx.softwareAssetProfile.upsert({
          where: { resourceAssetId: current.id },
          create: {
            resourceAssetId: current.id,
            platform: nextProfile.platform ?? null,
            accountIdentifier: nextProfile.accountIdentifier ?? null,
            licenseType: nextProfile.licenseType ?? null,
            seatsTotal: nextProfile.seatsTotal ?? null,
            seatsUsed: nextProfile.seatsUsed ?? 0,
            autoRenewal: nextProfile.autoRenewal ?? false,
            renewalCostCents: toBigIntOrNull(nextProfile.renewalCostCents),
            renewalCurrency: nextProfile.renewalCurrency ?? parsed.data.currency ?? current.currency,
            renewalCycle: nextProfile.renewalCycle ?? null,
          },
          update: {
            platform: nextProfile.platform === undefined ? current.softwareProfile?.platform ?? null : nextProfile.platform,
            accountIdentifier: nextProfile.accountIdentifier === undefined ? current.softwareProfile?.accountIdentifier ?? null : nextProfile.accountIdentifier,
            licenseType: nextProfile.licenseType === undefined ? current.softwareProfile?.licenseType ?? null : nextProfile.licenseType,
            seatsTotal: nextProfile.seatsTotal === undefined ? current.softwareProfile?.seatsTotal ?? null : nextProfile.seatsTotal,
            seatsUsed: nextProfile.seatsUsed === undefined ? current.softwareProfile?.seatsUsed ?? 0 : nextProfile.seatsUsed ?? 0,
            autoRenewal: nextProfile.autoRenewal === undefined ? current.softwareProfile?.autoRenewal ?? false : nextProfile.autoRenewal,
            renewalCostCents: nextProfile.renewalCostCents === undefined ? current.softwareProfile?.renewalCostCents ?? null : toBigIntOrNull(nextProfile.renewalCostCents),
            renewalCurrency: nextProfile.renewalCurrency === undefined ? current.softwareProfile?.renewalCurrency ?? parsed.data.currency ?? current.currency : nextProfile.renewalCurrency ?? current.softwareProfile?.renewalCurrency ?? parsed.data.currency ?? current.currency,
            renewalCycle: nextProfile.renewalCycle === undefined ? current.softwareProfile?.renewalCycle ?? null : nextProfile.renewalCycle,
          },
        });
      }
      const resource = await tx.resourceAsset.findUniqueOrThrow({ where: { id: current.id }, include: resourceAssetInclude });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resources",
        action: "resource.update",
        targetType: "resource_asset",
        targetId: resource.id,
        legalEntityId: resource.legalEntityId,
        businessUnitId: resource.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          resourceNo: resource.resourceNo,
          changedFields: Object.keys(parsed.data).filter((key) => key !== "software"),
          softwareProfileChanged: parsed.data.software !== undefined,
        },
      }, tx);
      return resource;
    });
    return ok(serializeResource(updated, accountReadPlan.allows(resourceTargetOf(updated))));
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源更新失败。";
    if (message.includes("ResourceAsset_businessUnitId_resourceNo_key")) return fail("RESOURCE_NO_CONFLICT", "资源编号已存在，请更换后重试。", 409);
    throw error;
  }
}

// Lifecycle history is retained for audit. DELETE is deliberately an archive
// operation rather than a physical delete, so a past assignment can never
// disappear from the asset ledger.
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const current = await findAsset(id, auth.membership.businessUnitId);
  if (!current) return fail("NOT_FOUND", "资源不存在。", 404);
  const archivePlan = await createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.archive" });
  if (!archivePlan.allowed || !archivePlan.allows(resourceTargetOf(current))) return fail("FORBIDDEN", "没有归档该资源的权限。", 403);
  if (!current.isActive) return ok({ archived: current.id, alreadyArchived: true });

  try {
    const archived = await prisma.$transaction(async (tx) => {
      const mutation = await tx.resourceAsset.updateMany({
        where: {
          id: current.id,
          businessUnitId: current.businessUnitId,
          isActive: true,
          version: current.version,
        },
        data: { isActive: false, archivedAt: new Date(), version: { increment: 1 } },
      });
      if (mutation.count !== 1) throw new Error("RESOURCE_VERSION_CONFLICT");
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resources",
        action: "resource.archive",
        targetType: "resource_asset",
        targetId: current.id,
        legalEntityId: current.legalEntityId,
        businessUnitId: current.businessUnitId,
        roleId: auth.membership.roleId,
        details: { resourceNo: current.resourceNo },
      }, tx);
      return current.id;
    });
    return ok({ archived });
  } catch (error) {
    if (error instanceof Error && error.message.includes("RESOURCE_VERSION_CONFLICT")) {
      return fail("RESOURCE_VERSION_CONFLICT", "资源刚被其他人更新，请刷新后再归档。", 409);
    }
    throw error;
  }
}
