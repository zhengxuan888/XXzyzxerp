import { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";
import { resourceConfigPatchSchema } from "@/lib/resource-input";
import { prisma } from "@/lib/prisma";

const WIDE_SCOPES = ["ALL", "BUSINESS_UNIT"] as const;

async function canConfigure(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "resource.configure",
    targetBusinessUnitId: auth.membership.businessUnitId,
    allowedScopes: WIDE_SCOPES,
  });
}

function changedFields(input: Record<string, unknown>) {
  return Object.keys(input).filter((key) => key !== "kind");
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canConfigure(auth);
  if (!permission.allowed) return fail("FORBIDDEN", "没有维护资源配置的权限。", 403);

  const body = await request.json().catch(() => null);
  const parsed = resourceConfigPatchSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_RESOURCE_CONFIG", "资源配置不符合要求。", 400, parsed.error.flatten());
  // Keep the discriminated union in a local immutable binding. TypeScript does
  // not retain a narrowing of `parsed.data` inside transaction callbacks.
  const input = parsed.data;
  const updates = changedFields(input);
  if (!updates.length) return fail("RESOURCE_CONFIG_UPDATE_EMPTY", "没有可更新的配置字段。", 400);
  const { id } = await props.params;

  if (input.kind === "category") {
    const current = await prisma.resourceCategory.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
    if (!current) return fail("RESOURCE_CONFIG_NOT_FOUND", "资源分类不存在或不属于当前业务板块。", 404);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.resourceCategory.update({
        where: { id: current.id },
        data: {
          name: input.name ?? current.name,
          description: input.description === undefined ? current.description : input.description,
          isSoftware: input.isSoftware ?? current.isSoftware,
          sortOrder: input.sortOrder ?? current.sortOrder,
          isActive: input.isActive ?? current.isActive,
        },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resource_config",
        action: "resource.configure.update",
        targetType: "resource_category",
        targetId: updated.id,
        legalEntityId: updated.legalEntityId,
        businessUnitId: updated.businessUnitId,
        roleId: auth.membership.roleId,
        details: { code: updated.code, changedFields: updates },
      }, tx);
      return updated;
    });
    return ok(row);
  }

  if (input.kind === "status") {
    const current = await prisma.resourceStatus.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
    if (!current) return fail("RESOURCE_CONFIG_NOT_FOUND", "资源状态不存在或不属于当前业务板块。", 404);
    if (input.isActive === false) {
      const dependentActiveActions = await prisma.resourceLifecycleAction.count({
        where: {
          businessUnitId: auth.membership.businessUnitId,
          isActive: true,
          OR: [{ fromStatusId: current.id }, { toStatusId: current.id }],
        },
      });
      if (dependentActiveActions) {
        return fail("RESOURCE_STATUS_IN_USE", "请先停用引用该状态的流转动作，再停用资源状态。", 409);
      }
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.resourceStatus.update({
        where: { id: current.id },
        data: {
          name: input.name ?? current.name,
          color: input.color === undefined ? current.color : input.color,
          isTerminal: input.isTerminal ?? current.isTerminal,
          sortOrder: input.sortOrder ?? current.sortOrder,
          isActive: input.isActive ?? current.isActive,
        },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resource_config",
        action: "resource.configure.update",
        targetType: "resource_status",
        targetId: updated.id,
        legalEntityId: updated.legalEntityId,
        businessUnitId: updated.businessUnitId,
        roleId: auth.membership.roleId,
        details: { code: updated.code, changedFields: updates },
      }, tx);
      return updated;
    });
    return ok(row);
  }

  const current = await prisma.resourceLifecycleAction.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
  if (!current) return fail("RESOURCE_CONFIG_NOT_FOUND", "资源流转动作不存在或不属于当前业务板块。", 404);
  const nextFromStatusId = input.fromStatusId === undefined ? current.fromStatusId : input.fromStatusId;
  const nextToStatusId = input.toStatusId === undefined ? current.toStatusId : input.toStatusId;
  const nextIsActive = input.isActive ?? current.isActive;
  const statusIds = [nextFromStatusId, nextToStatusId].filter((value): value is string => Boolean(value));
  if (nextIsActive && statusIds.length) {
    const activeStatusCount = await prisma.resourceStatus.count({
      where: { id: { in: statusIds }, businessUnitId: auth.membership.businessUnitId, isActive: true },
    });
    if (activeStatusCount !== new Set(statusIds).size) {
      return fail("RESOURCE_STATUS_INVALID", "启用中的流转动作只能引用当前业务板块内启用的状态。", 400);
    }
  }
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.resourceLifecycleAction.update({
      where: { id: current.id },
      data: {
        name: input.name ?? current.name,
        fromStatusId: nextFromStatusId,
        toStatusId: nextToStatusId,
        availableQuantityDelta: input.availableQuantityDelta ?? current.availableQuantityDelta,
        archiveAsset: input.archiveAsset ?? current.archiveAsset,
        requiresAssignee: input.requiresAssignee ?? current.requiresAssignee,
        sortOrder: input.sortOrder ?? current.sortOrder,
        isActive: nextIsActive,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.resource_config",
      action: "resource.configure.update",
      targetType: "resource_lifecycle_action",
      targetId: updated.id,
      legalEntityId: updated.legalEntityId,
      businessUnitId: updated.businessUnitId,
      roleId: auth.membership.roleId,
      details: { code: updated.code, changedFields: updates },
    }, tx);
    return updated;
  });
  return ok(row);
}
