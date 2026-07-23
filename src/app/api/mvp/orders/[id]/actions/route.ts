import { NextRequest, NextResponse } from "next/server";

import type { OrderStatus, Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { finalizeOrderInventory, InventoryError, reserveOrderInventory } from "@/lib/inventory";
import { canTransitionOrder } from "@/lib/order-state";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type WorkflowAction = "submit" | "approve" | "reject" | "ship";

const ACTION_CONFIG: Record<
  WorkflowAction,
  { permission: string; from: readonly OrderStatus[]; to: OrderStatus }
> = {
  submit: { permission: "order.submit", from: ["DRAFT"], to: "SUBMITTED" },
  approve: { permission: "order.review", from: ["SUBMITTED"], to: "WAITING_SHIPMENT" },
  reject: { permission: "order.review", from: ["SUBMITTED"], to: "DRAFT" },
  ship: { permission: "order.ship", from: ["WAITING_SHIPMENT"], to: "SHIPPED" },
};

function parseAction(value: unknown): WorkflowAction | null {
  return typeof value === "string" && value in ACTION_CONFIG ? (value as WorkflowAction) : null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const body = await request.json().catch(() => null);
  const action = parseAction(body?.action);
  if (!action) return fail("INVALID_WORKFLOW_ACTION", "不支持的订单操作。", 400);

  const order = await prisma.order.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { items: { select: { skuId: true, quantity: true } } },
  });
  if (!order) return fail("ORDER_NOT_FOUND", "订单不存在或不属于当前业务板块。", 404);

  const config = ACTION_CONFIG[action];
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: config.permission,
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
  });
  if (!permission.allowed) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "当前岗位没有执行此操作的权限。" } }, { status: 403 });
  }

  if (!config.from.includes(order.status) || !canTransitionOrder(order.status, config.to)) {
    return fail(
      "INVALID_ORDER_TRANSITION",
      `订单当前状态为 ${order.status}，不能执行 ${action}。`,
      409,
      { currentStatus: order.status, expectedStatus: config.from },
    );
  }

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (action === "reject" && !note) {
    return fail("REVIEW_NOTE_REQUIRED", "核单驳回时必须填写原因。", 400);
  }

  const carrier = typeof body?.carrier === "string" ? body.carrier.trim().slice(0, 100) : "";
  const trackingNo = typeof body?.trackingNo === "string" ? body.trackingNo.trim().slice(0, 100) : "";
  if (action === "ship" && (!carrier || !trackingNo)) {
    return fail("SHIPMENT_FIELDS_REQUIRED", "发货时必须填写承运商和物流单号。", 400);
  }
  if ((action === "submit" || action === "ship") && !auth.membership.siteId) {
    return fail("SITE_REQUIRED", "当前岗位必须关联仓库/站点后才能操作库存和发货。", 409);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const current = await tx.order.findFirst({
          where: { id: order.id, businessUnitId: auth.membership.businessUnitId },
          include: { items: { select: { skuId: true, quantity: true } } },
        });
        if (!current || current.status !== order.status) {
          throw new Error("ORDER_CONCURRENTLY_CHANGED");
        }

        if (action === "submit") {
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

        if (action === "reject") {
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
          const duplicateTracking = await tx.shipment.findFirst({
            where: {
              businessUnitId: current.businessUnitId,
              trackingNo,
              NOT: { orderId: current.id },
            },
            select: { id: true },
          });
          if (duplicateTracking) throw new Error("TRACKING_NO_ALREADY_EXISTS");

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

          const shippedAt = new Date();
          const existing = await tx.shipment.findFirst({
            where: { orderId: current.id, status: "PENDING" },
            orderBy: { createdAt: "desc" },
          });
          const shipmentData = {
            carrier,
            trackingNo,
            status: "IN_TRANSIT" as const,
            shippedAt,
            firstTrackedAt: shippedAt,
            lastTrackedAt: shippedAt,
            workStatus: "MONITORING" as const,
            nextFollowUpAt: new Date(shippedAt.getTime() + 24 * 60 * 60 * 1000),
            memo: note || "订单已发货，自动进入物流跟踪。",
          };
          const shipment = existing
            ? await tx.shipment.update({ where: { id: existing.id }, data: shipmentData })
            : await tx.shipment.create({
                data: {
                  orderId: current.id,
                  legalEntityId: current.legalEntityId,
                  businessUnitId: current.businessUnitId,
                  siteId: auth.membership.siteId,
                  ...shipmentData,
                },
              });
          shipmentId = shipment.id;

          await tx.shipmentEvent.createMany({
            data: [
              {
                shipmentId: shipment.id,
                eventType: "SHIPMENT_CREATED",
                statusMilestone: "PENDING",
                source: "ERP",
                externalEventKey: `order:${current.id}:shipment-created`,
                memo: "物流单已创建。",
                actorMembershipId: auth.membership.id,
              },
              {
                shipmentId: shipment.id,
                eventType: "PICKED_UP",
                statusMilestone: "IN_TRANSIT",
                source: "ERP",
                externalEventKey: `order:${current.id}:shipped`,
                memo: note || "订单已发货，开始物流跟踪。",
                actorMembershipId: auth.membership.id,
              },
            ],
            skipDuplicates: true,
          });
        }

        const updated = await tx.order.update({
          where: { id: current.id, status: current.status },
          data: {
            status: config.to,
            note: note || undefined,
            exceptionNote: action === "reject" ? note : undefined,
          },
        });
        return { order: updated, shipmentId };
      },
      { isolationLevel: "Serializable" },
    );

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "sales.order_workflow",
      action: `order.${action}`,
      targetType: "order",
      targetId: result.order.id,
      businessUnitId: result.order.businessUnitId,
      roleId: auth.membership.roleId,
      details: {
        fromStatus: order.status,
        toStatus: result.order.status,
        note: note || null,
        shipmentId: result.shipmentId,
      } satisfies Prisma.InputJsonObject,
    });

    return ok(result);
  } catch (error) {
    if (error instanceof InventoryError) return fail(error.code, error.message, 409);
    if (error instanceof Error && error.message === "ORDER_CONCURRENTLY_CHANGED") {
      return fail("ORDER_CONCURRENTLY_CHANGED", "订单已被其他员工修改，请刷新后重试。", 409);
    }
    if (error instanceof Error && error.message === "TRACKING_NO_ALREADY_EXISTS") {
      return fail("TRACKING_NO_ALREADY_EXISTS", "该物流单号已用于其他订单。", 409);
    }
    throw error;
  }
}
