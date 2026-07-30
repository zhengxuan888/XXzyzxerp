import { NextRequest } from "next/server";

import { Prisma, type LogisticsWorkStatus } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const WORK_STATUSES = new Set<LogisticsWorkStatus>([
  "MONITORING",
  "NEEDS_ATTENTION",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_CARRIER",
  "RESOLVED",
  "NO_ACTION_REQUIRED",
  "CLOSED",
]);

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const shipment = await prisma.shipment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: {
      order: {
        select: {
          departmentId: true,
          creatorUserId: true,
        },
      },
    },
  });
  if (!shipment) return fail("SHIPMENT_NOT_FOUND", "物流单不存在或不属于当前业务板块。", 404);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: shipment.businessUnitId,
    targetDepartmentId: shipment.order.departmentId,
    targetSiteId: shipment.siteId,
    targetUserId: shipment.order.creatorUserId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "当前岗位没有物流跟进权限。", 403);

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!note) return fail("FOLLOW_UP_NOTE_REQUIRED", "跟进备注不能为空。", 400);

  const workStatus = typeof body?.workStatus === "string" ? body.workStatus.toUpperCase() as LogisticsWorkStatus : shipment.workStatus;
  if (!WORK_STATUSES.has(workStatus)) return fail("INVALID_WORK_STATUS", "无效的跟进状态。", 400);

  let nextFollowUpAt: Date | null = shipment.nextFollowUpAt;
  if (body?.nextFollowUpAt === null || body?.nextFollowUpAt === "") {
    nextFollowUpAt = null;
  } else if (typeof body?.nextFollowUpAt === "string") {
    nextFollowUpAt = new Date(body.nextFollowUpAt);
    if (Number.isNaN(nextFollowUpAt.getTime())) return fail("INVALID_NEXT_FOLLOW_UP_AT", "下次跟进时间格式不正确。", 400);
  }

  const hasOwnerAssignment = typeof body?.ownerMembershipId === "string" && Boolean(body.ownerMembershipId.trim());
  const ownerMembershipId = hasOwnerAssignment ? body.ownerMembershipId.trim() : shipment.ownerMembershipId;
  if (
    hasOwnerAssignment &&
    shipment.ownerMembershipId &&
    shipment.ownerMembershipId !== ownerMembershipId &&
    shipment.ownerMembershipId !== auth.membership.id
  ) {
    const assignPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "shipment.followup.assign",
      targetBusinessUnitId: shipment.businessUnitId,
      targetDepartmentId: shipment.order.departmentId,
      targetSiteId: shipment.siteId,
      targetUserId: shipment.order.creatorUserId,
    });
    if (!assignPermission.allowed) {
      return fail("FOLLOW_UP_REASSIGN_FORBIDDEN", "该任务已有负责人，当前岗位没有改派权限。", 403);
    }
  }
  if (hasOwnerAssignment && ownerMembershipId) {
    const owner = await prisma.membership.findFirst({
      where: { id: ownerMembershipId, businessUnitId: shipment.businessUnitId, isActive: true },
      select: { id: true, userId: true },
    });
    if (!owner) return fail("INVALID_FOLLOW_UP_OWNER", "跟进人不属于当前业务板块或已停用。", 400);
    const [ownerCanRead, ownerCanUpdate] = await Promise.all([
      checkPermission({
        userId: owner.userId,
        membershipId: owner.id,
        actionKey: "shipment.read",
        targetBusinessUnitId: shipment.businessUnitId,
        targetDepartmentId: shipment.order.departmentId,
        targetSiteId: shipment.siteId,
        targetUserId: shipment.order.creatorUserId,
      }),
      checkPermission({
        userId: owner.userId,
        membershipId: owner.id,
        actionKey: "shipment.track.update",
        targetBusinessUnitId: shipment.businessUnitId,
        targetDepartmentId: shipment.order.departmentId,
        targetSiteId: shipment.siteId,
        targetUserId: shipment.order.creatorUserId,
      }),
    ]);
    if (!ownerCanRead.allowed || !ownerCanUpdate.allowed) {
      return fail("FOLLOW_UP_OWNER_OUT_OF_SCOPE", "该员工没有查看或处理此订单物流的权限，不能转派。", 403);
    }
  }

  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" && !Number.isNaN(Date.parse(body.expectedUpdatedAt))
    ? new Date(body.expectedUpdatedAt)
    : null;
  if (!expectedUpdatedAt) {
    return fail("SHIPMENT_VERSION_REQUIRED", "缺少物流任务版本，请刷新页面后重试。", 400);
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findUnique({
        where: { id: shipment.id },
        select: { updatedAt: true, workStatus: true, ownerMembershipId: true },
      });
      if (!current || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new Error("FOLLOW_UP_CONCURRENTLY_CHANGED");
      }
      const updated = await tx.shipment.update({
        where: { id: shipment.id, updatedAt: expectedUpdatedAt },
        data: {
          workStatus,
          ownerMembershipId,
          nextFollowUpAt,
          closedAt: workStatus === "CLOSED" ? new Date() : null,
          closeReason: workStatus === "CLOSED" ? note : null,
        },
      });
      const followUp = await tx.logisticsFollowUp.create({
        data: {
          shipmentId: shipment.id,
          businessUnitId: shipment.businessUnitId,
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          actionType: "AFTERSALES_NOTE",
          fromStatus: current.workStatus,
          toStatus: workStatus,
          note,
          nextFollowUpAt,
        },
      });
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "sales.logistics_follow_up",
        action: "shipment.follow_up.create",
        targetType: "shipment",
        targetId: shipment.id,
        businessUnitId: shipment.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          fromStatus: current.workStatus,
          toStatus: workStatus,
          previousOwnerMembershipId: current.ownerMembershipId,
          ownerMembershipId,
          nextFollowUpAt,
        },
      }, tx);
      return { shipment: updated, followUp };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "FOLLOW_UP_CONCURRENTLY_CHANGED")
      || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code))
    ) {
      return fail(
        "FOLLOW_UP_CONCURRENTLY_CHANGED",
        "该物流任务已被其他员工认领或更新，请刷新后查看最新负责人，系统未覆盖原数据。",
        409,
      );
    }
    throw error;
  }
  return ok(result, { status: 201 });
}
