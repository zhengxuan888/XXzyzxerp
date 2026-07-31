import { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { resolveResourceTransition, resourceLifecycleInputSchema } from "@/lib/resource-input";
import { createResourceAccessPlan } from "@/lib/resource-access";
import { resourceAssetInclude, resourceTargetOf, serializeResource } from "@/lib/resource-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const parsed = resourceLifecycleInputSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_RESOURCE_LIFECYCLE", "资源流转资料不符合要求。", 400, parsed.error.flatten());

  const [asset, lifecycleAction, lifecyclePlan, accountPlan] = await Promise.all([
    prisma.resourceAsset.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId }, include: resourceAssetInclude }),
    prisma.resourceLifecycleAction.findFirst({
      where: { id: parsed.data.lifecycleActionId, businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        fromStatusId: true,
        toStatusId: true,
        availableQuantityDelta: true,
        archiveAsset: true,
        requiresAssignee: true,
      },
    }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.lifecycle.manage" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.read" }),
  ]);
  if (!asset) return fail("NOT_FOUND", "资源不存在。", 404);
  if (!asset.isActive) return fail("RESOURCE_ARCHIVED", "已归档资源不能继续流转。", 409);
  if (asset.status.isTerminal) return fail("RESOURCE_TERMINAL", "资源已处于终态，不能继续流转。", 409);
  if (!lifecyclePlan.allowed || !lifecyclePlan.allows(resourceTargetOf(asset))) return fail("FORBIDDEN", "没有处理该资源流转的权限。", 403);
  if (!lifecycleAction) return fail("LIFECYCLE_ACTION_NOT_FOUND", "流转动作不存在、已停用或不属于当前业务板块。", 400);
  const referencedStatusIds = [lifecycleAction.fromStatusId, lifecycleAction.toStatusId].filter((value): value is string => Boolean(value));
  if (referencedStatusIds.length) {
    const activeStatusCount = await prisma.resourceStatus.count({
      where: { id: { in: referencedStatusIds }, businessUnitId: auth.membership.businessUnitId, isActive: true },
    });
    if (activeStatusCount !== new Set(referencedStatusIds).size) {
      return fail("RESOURCE_STATUS_INACTIVE", "流转动作引用了不存在或已停用的资源状态。", 409);
    }
  }

  const hasNextAssignee = Boolean(body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "nextAssigneeMembershipId"));
  let nextAssignee = asset.assignedMembership;
  if (hasNextAssignee) {
    const nextId = parsed.data.nextAssigneeMembershipId ?? null;
    nextAssignee = nextId
      ? await prisma.membership.findFirst({
          where: {
            id: nextId,
            businessUnitId: auth.membership.businessUnitId,
            isActive: true,
            OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
          },
          select: { id: true, departmentId: true, siteId: true, user: { select: { id: true, username: true, fullName: true } } },
        })
      : null;
    if (nextId && !nextAssignee) return fail("ASSIGNEE_INVALID", "新的领用员工不存在、已停用或不属于当前业务板块。", 400);
  }
  if (lifecycleAction.requiresAssignee && !nextAssignee) return fail("ASSIGNEE_REQUIRED", "该流转动作需要指定领用员工。", 400);

  const nextTarget = {
    businessUnitId: asset.businessUnitId,
    departmentId: nextAssignee?.departmentId ?? asset.departmentId,
    siteId: nextAssignee?.siteId ?? asset.siteId,
    assignedMembershipId: nextAssignee?.id ?? null,
  };
  if (!lifecyclePlan.allows(nextTarget)) return fail("FORBIDDEN", "不能把资源流转到无权管理的人员或组织范围。", 403);

  let transition;
  try {
    transition = resolveResourceTransition({
      currentStatusId: asset.statusId,
      action: lifecycleAction,
      availableQuantity: asset.availableQuantity,
      quantity: asset.quantity,
    });
  } catch (error) {
    return fail("RESOURCE_TRANSITION_INVALID", error instanceof Error ? error.message : "资源流转无效。", 409);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const mutation = await tx.resourceAsset.updateMany({
        where: {
          id: asset.id,
          businessUnitId: asset.businessUnitId,
          isActive: true,
          version: asset.version,
        },
      data: {
        statusId: transition.statusId,
        availableQuantity: transition.availableQuantity,
        departmentId: nextTarget.departmentId,
        siteId: nextTarget.siteId,
        assignedMembershipId: nextTarget.assignedMembershipId,
        isActive: transition.archiveAsset ? false : true,
        archivedAt: transition.archiveAsset ? new Date() : null,
        version: { increment: 1 },
      },
      });
      if (mutation.count !== 1) throw new Error("RESOURCE_VERSION_CONFLICT");
      const resource = await tx.resourceAsset.findUniqueOrThrow({ where: { id: asset.id }, include: resourceAssetInclude });
      await tx.resourceLifecycleEvent.create({
        data: {
          resourceAssetId: asset.id,
          legalEntityId: asset.legalEntityId,
          businessUnitId: asset.businessUnitId,
          departmentId: nextTarget.departmentId,
          siteId: nextTarget.siteId,
          lifecycleActionId: lifecycleAction.id,
          fromStatusId: asset.statusId,
          toStatusId: transition.statusId,
          fromAssigneeMembershipId: asset.assignedMembershipId,
          toAssigneeMembershipId: nextTarget.assignedMembershipId,
          availableQuantityBefore: asset.availableQuantity,
          availableQuantityAfter: transition.availableQuantity,
          note: parsed.data.note ?? null,
          performedByMembershipId: auth.membership.id,
        },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resources",
        action: "resource.lifecycle.transition",
        targetType: "resource_asset",
        targetId: asset.id,
        legalEntityId: asset.legalEntityId,
        businessUnitId: asset.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          lifecycleActionId: lifecycleAction.id,
          lifecycleActionCode: lifecycleAction.code,
          fromStatusId: asset.statusId,
          toStatusId: transition.statusId,
          fromAssigneeMembershipId: asset.assignedMembershipId,
          toAssigneeMembershipId: nextTarget.assignedMembershipId,
          availableQuantityBefore: asset.availableQuantity,
          availableQuantityAfter: transition.availableQuantity,
          archived: transition.archiveAsset,
          noteProvided: Boolean(parsed.data.note),
        },
      }, tx);
      return resource;
    });
    return ok(serializeResource(updated, accountPlan.allows(resourceTargetOf(updated))));
  } catch (error) {
    if (error instanceof Error && error.message.includes("RESOURCE_VERSION_CONFLICT")) {
      return fail("RESOURCE_VERSION_CONFLICT", "资源刚被其他人更新，请刷新后再处理。", 409);
    }
    throw error;
  }
}
