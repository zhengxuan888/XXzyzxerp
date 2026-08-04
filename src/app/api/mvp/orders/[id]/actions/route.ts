import { NextRequest } from "next/server";

import { Prisma, type OrderStatus } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { finalizeOrderInventory, InventoryError, reserveOrderInventory } from "@/lib/inventory";
import { canTransitionOrder } from "@/lib/order-state";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type WorkflowAction = "submit" | "approve" | "reject" | "void" | "ship";

type WorkflowResult = {
  order: {
    id: string;
    status: OrderStatus;
    businessUnitId: string;
  };
  shipmentId: string | null;
};

const ACTION_CONFIG: Record<WorkflowAction, { permission: string; from: readonly OrderStatus[]; to: OrderStatus }> = {
  submit: { permission: "order.submit", from: ["DRAFT"], to: "SUBMITTED" },
  approve: { permission: "order.review.approve", from: ["SUBMITTED"], to: "WAITING_SHIPMENT" },
  reject: { permission: "order.review.reject", from: ["SUBMITTED"], to: "DRAFT" },
  void: { permission: "order.void", from: ["SUBMITTED", "WAITING_SHIPMENT", "EXCEPTION"], to: "CANCELLED" },
  ship: { permission: "order.ship", from: ["WAITING_SHIPMENT"], to: "SHIPPED" },
};

function parseAction(value: unknown): WorkflowAction | null {
  return typeof value === "string" && value in ACTION_CONFIG ? (value as WorkflowAction) : null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录", 401);

  const body = await request.json().catch(() => null);
  const action = parseAction(body?.action);
  if (!action) return fail("INVALID_WORKFLOW_ACTION", "无效的订单动作", 400);

  const order = await prisma.order.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { items: { select: { skuId: true, quantity: true, stockControlled: true } } },
  });
  if (!order) return fail("ORDER_NOT_FOUND", "订单不存在或无权限", 404);

  const config = ACTION_CONFIG[action];
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: config.permission,
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
    targetUserId: order.creatorUserId,
    targetMembershipId: order.ownedByMembershipId,
  });
  if (!permission.allowed) {
    return fail("FORBIDDEN", "当前角色无权执行此操作", 403);
  }

  if (action === "approve") {
    const proofPermission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "order.review.proof.upload", targetBusinessUnitId: order.businessUnitId, targetDepartmentId: order.departmentId, targetSiteId: order.siteId, targetUserId: order.creatorUserId, targetMembershipId: order.ownedByMembershipId });
    if (!proofPermission.allowed) return fail("FORBIDDEN", "当前角色未配置核单凭证权限", 403);
  }
  if (!config.from.includes(order.status) || !canTransitionOrder(order.status, config.to)) {
    return fail(
      "INVALID_ORDER_TRANSITION",
      `订单当前状态为 ${order.status}，不允许执行 ${action}`,
      409,
      { currentStatus: order.status, expectedStatus: config.from },
    );
  }

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if ((action === "reject" || action === "void") && !note) {
    return fail("REVIEW_NOTE_REQUIRED", "请填写原因", 400);
  }

  if ((action === "submit" || action === "ship") && !auth.membership.siteId) {
    return fail("SITE_REQUIRED", "当前用户未绑定站点，无法执行此操作", 409);
  }

  try {
    const result = await prisma.$transaction<WorkflowResult>(async (tx) => {
      const current = await tx.order.findFirst({
        where: { id: order.id, businessUnitId: auth.membership.businessUnitId },
        include: { items: { select: { skuId: true, quantity: true, stockControlled: true } } },
      });
      if (!current || current.status !== order.status) {
        throw new Error("ORDER_CONCURRENTLY_CHANGED");
      }
      const hasStockControlledItems = current.items.some((item) => item.stockControlled);
      if (action === "submit") {
        const communicationProofCount = await tx.attachment.count({
          where: {
            businessUnitId: current.businessUnitId,
            targetType: "ORDER",
            targetId: current.id,
            status: "ACTIVE",
          },
        });
        if (communicationProofCount < 1) {
          throw new Error("ORDER_COMMUNICATION_PROOF_REQUIRED");
        }
        await reserveOrderInventory(
          tx,
          {
            userId: auth.userId,
            membershipId: auth.membership.id,
            businessUnitId: auth.membership.businessUnitId,
            siteId: auth.membership.siteId!,
          },
          current,
        );
      }

      if (action === "approve") {
        const reviewProofCount = await tx.attachment.count({
          where: {
            businessUnitId: current.businessUnitId,
            targetType: "ORDER_REVIEW",
            targetId: current.id,
            status: "ACTIVE",
            uploadedByMembershipId: auth.membership.id,
          },
        });
        if (reviewProofCount < 1) throw new Error("ORDER_REVIEW_PROOF_REQUIRED");
      }

      if ((action === "reject" || action === "void") && hasStockControlledItems) {
        await finalizeOrderInventory(
          tx,
          {
            userId: auth.userId,
            membershipId: auth.membership.id,
            businessUnitId: auth.membership.businessUnitId,
            siteId: auth.membership.siteId ?? current.siteId ?? "",
          },
          current.id,
          "RELEASE",
        );
      }

      let shipmentId: string | null = null;
      if (action === "ship") {
        const pendingShipment = await tx.shipment.findFirst({
          where: { orderId: current.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          select: { id: true, carrier: true, trackingNo: true },
        });
        if (!pendingShipment) throw new Error("SHIPMENT_NOT_READY");

        const carrier = typeof body?.carrier === "string" ? body.carrier.trim().slice(0, 100) : "";
        const trackingNo = typeof body?.trackingNo === "string" ? body.trackingNo.trim().slice(0, 100) : "";

        if ((body?.carrier !== undefined && body.carrier !== null) || (body?.trackingNo !== undefined && body.trackingNo !== null)) {
          if (!carrier || !trackingNo) throw new Error("SHIPMENT_FIELDS_REQUIRED");
        }

        const nextCarrier = carrier || pendingShipment.carrier || "";
        const nextTrackingNo = trackingNo || pendingShipment.trackingNo || "";
        if (!nextCarrier || !nextTrackingNo) throw new Error("SHIPMENT_FIELDS_REQUIRED");

        if (trackingNo && trackingNo !== pendingShipment.trackingNo) {
          const duplicateTracking = await tx.shipment.findFirst({
            where: {
              businessUnitId: current.businessUnitId,
              trackingNo,
              NOT: { id: pendingShipment.id },
            },
            select: { id: true },
          });
          if (duplicateTracking) throw new Error("TRACKING_NO_ALREADY_EXISTS");
        }

        const proofCount = await tx.attachment.count({
          where: {
            businessUnitId: current.businessUnitId,
            targetType: "SHIPMENT",
            targetId: pendingShipment.id,
            status: "ACTIVE",
          },
        });
        if (proofCount < 1) throw new Error("SHIPMENT_PROOF_REQUIRED");

        const shippedAt = new Date();
        const shipment = await tx.shipment.update({
          where: { id: pendingShipment.id, status: "PENDING" },
          data: {
            carrier: nextCarrier,
            trackingNo: nextTrackingNo,
            status: "IN_TRANSIT",
            shippedAt,
            firstTrackedAt: shippedAt,
            lastTrackedAt: shippedAt,
            workStatus: "MONITORING",
            nextFollowUpAt: new Date(shippedAt.getTime() + 24 * 60 * 60 * 1000),
            memo: note || "订单确认发货，等待物流",
          },
        });
        shipmentId = shipment.id;

        if (hasStockControlledItems) {
          await finalizeOrderInventory(
            tx,
            {
              userId: auth.userId,
              membershipId: auth.membership.id,
              businessUnitId: auth.membership.businessUnitId,
              siteId: auth.membership.siteId!,
            },
            current.id,
            "SHIP",
          );
        }

        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            eventType: "PICKED_UP",
            statusMilestone: "IN_TRANSIT",
            source: "ERP",
            externalEventKey: `order:${current.id}:shipped`,
            memo: note || "订单确认发货，等待物流",
            actorMembershipId: auth.membership.id,
          },
        });
      }

      const updated = await tx.order.update({
        where: { id: current.id, status: current.status },
        data: {
          status: config.to,
          note: note || undefined,
          exceptionNote: action === "reject" || action === "void" ? note : undefined,
          reviewClaimedByMembershipId: action === "approve" || action === "reject" || action === "void" ? null : undefined,
          reviewClaimedAt: action === "approve" || action === "reject" || action === "void" ? null : undefined,
        },
      });

      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "sales.order_workflow",
        action: `order.${action}`,
        targetType: "order",
        targetId: updated.id,
        businessUnitId: updated.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          fromStatus: current.status,
          toStatus: updated.status,
          note: note || null,
          shipmentId,
        },
      }, tx);

      return { order: updated, shipmentId };
    }, { isolationLevel: "Serializable" });

    return ok(result);
  } catch (error) {
    if (error instanceof InventoryError) return fail(error.code, error.message, 409);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && ["P2002", "P2025", "P2034"].includes(error.code)
    ) {
      return fail(
        "ORDER_CONCURRENTLY_CHANGED",
        "订单或物流记录刚刚被其他人处理，请刷新后核对，系统未重复发货。",
        409,
      );
    }
    if (error instanceof Error && error.message === "ORDER_CONCURRENTLY_CHANGED") {
      return fail("ORDER_CONCURRENTLY_CHANGED", "订单已变更，请稍后重试", 409);
    }
    if (error instanceof Error && error.message === "TRACKING_NO_ALREADY_EXISTS") {
      return fail("TRACKING_NO_ALREADY_EXISTS", "物流单号已被占用", 409);
    }
    if (error instanceof Error && error.message === "SHIPMENT_NOT_READY") {
      return fail("SHIPMENT_NOT_READY", "请先创建待发货的物流记录", 409);
    }
    if (error instanceof Error && error.message === "SHIPMENT_PROOF_REQUIRED") {
      return fail("SHIPMENT_PROOF_REQUIRED", "请先上传发货凭证（图片/PDF）", 409);
    }
    if (error instanceof Error && error.message === "ORDER_COMMUNICATION_PROOF_REQUIRED") {
      return fail(
        "ORDER_COMMUNICATION_PROOF_REQUIRED",
        "提交核单前必须上传客户沟通凭证（图片、PDF 或视频）。",
        409,
      );
    }
    if (error instanceof Error && error.message === "ORDER_REVIEW_PROOF_REQUIRED") {
      return fail("ORDER_REVIEW_PROOF_REQUIRED", "核单通过前必须上传核单凭证。", 409);
    }
    if (error instanceof Error && error.message === "SHIPMENT_FIELDS_REQUIRED") {
      return fail("SHIPMENT_FIELDS_REQUIRED", "请填写承运商与物流单号", 400);
    }
    throw error;
  }
}
