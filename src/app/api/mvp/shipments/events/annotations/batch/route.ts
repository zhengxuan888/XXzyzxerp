import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type BatchItem = { shipmentId: string; eventId: string; expectedUpdatedAt: string | null };

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const body = await request.json().catch(() => null);
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = [...new Map<string, BatchItem>(
    rawItems
      .filter((item: unknown): item is BatchItem => {
        if (!item || typeof item !== "object") return false;
        const value = item as Partial<BatchItem>;
        return typeof value.shipmentId === "string"
          && typeof value.eventId === "string"
          && (
            value.expectedUpdatedAt === null
            || (typeof value.expectedUpdatedAt === "string" && !Number.isNaN(Date.parse(value.expectedUpdatedAt)))
          );
      })
      .map((item: BatchItem) => [`${item.shipmentId}:${item.eventId}`, item]),
  ).values()];
  if (!items.length) return fail("TRACKING_EVENTS_REQUIRED", "请至少选择一条物流轨迹。", 400);
  if (items.length > 50) return fail("TRACKING_EVENTS_LIMIT_EXCEEDED", "单次最多处理 50 条物流轨迹。", 400);

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!note) return fail("TRACKING_NOTE_REQUIRED", "批量处理前必须填写备注。", 400);
  const tags: string[] = Array.isArray(body?.tags)
    ? [...new Set<string>(
      body.tags
        .filter((tag: unknown): tag is string => typeof tag === "string")
        .map((tag: string) => tag.trim().slice(0, 30))
        .filter(Boolean),
    )].slice(0, 10)
    : [];
  const isHandled = body?.isHandled !== false;

  const events = await prisma.shipmentEvent.findMany({
    where: {
      id: { in: items.map((item) => item.eventId) },
      shipment: { businessUnitId: auth.membership.businessUnitId },
    },
    include: {
      shipment: {
        select: {
          id: true,
          businessUnitId: true,
          siteId: true,
          order: { select: { departmentId: true, creatorUserId: true } },
        },
      },
    },
  });
  const requested = new Set(items.map((item) => `${item.shipmentId}:${item.eventId}`));
  const found = new Set(events.map((event) => `${event.shipmentId}:${event.id}`));
  if (found.size !== requested.size || [...requested].some((key) => !found.has(key))) {
    return fail("TRACKING_EVENT_NOT_FOUND", "部分轨迹不存在或不属于当前业务范围，未执行任何修改。", 404);
  }

  for (const event of events) {
    const permission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "shipment.track.update",
      targetBusinessUnitId: event.shipment.businessUnitId,
      targetDepartmentId: event.shipment.order.departmentId,
      targetSiteId: event.shipment.siteId,
      targetUserId: event.shipment.order.creatorUserId,
    });
    if (!permission.allowed) {
      return fail("FORBIDDEN", "所选轨迹中包含无权处理的数据，未执行任何修改。", 403);
    }
  }

  const itemByEventId = new Map(items.map((item) => [item.eventId, item]));
  let annotations;
  try {
    annotations = await prisma.$transaction(async (tx) => {
      const saved = [];
      for (const event of events) {
        const expected = itemByEventId.get(event.id)!.expectedUpdatedAt;
        const existing = await tx.logisticsEventAnnotation.findUnique({
          where: { shipmentEventId: event.id },
          select: { updatedAt: true },
        });
        const isStale = expected === null
          ? Boolean(existing)
          : !existing || existing.updatedAt.getTime() !== new Date(expected).getTime();
        if (isStale) throw new Error("ANNOTATION_BATCH_CONCURRENTLY_CHANGED");

        const annotation = await tx.logisticsEventAnnotation.upsert({
          where: { shipmentEventId: event.id },
          update: {
            note,
            tags,
            isHandled,
            handledAt: isHandled ? new Date() : null,
            handledByMembershipId: isHandled ? auth.membership.id : null,
          },
          create: {
            shipmentId: event.shipmentId,
            shipmentEventId: event.id,
            businessUnitId: event.shipment.businessUnitId,
            note,
            tags,
            isHandled,
            handledAt: isHandled ? new Date() : null,
            handledByMembershipId: isHandled ? auth.membership.id : null,
          },
          include: {
            handledByMembership: {
              include: { user: { select: { username: true, fullName: true } } },
            },
          },
        });
        await writeAuditLog({
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          module: "logistics.event_annotation",
          action: "shipment.event.annotate.batch",
          targetType: "shipment_event",
          targetId: event.id,
          businessUnitId: event.shipment.businessUnitId,
          roleId: auth.membership.roleId,
          details: {
            shipmentId: event.shipmentId,
            batchSize: events.length,
            tags,
            isHandled,
            noteLength: note.length,
          },
        }, tx);
        saved.push(annotation);
      }
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "ANNOTATION_BATCH_CONCURRENTLY_CHANGED")
      || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))
    ) {
      return fail(
        "ANNOTATION_BATCH_CONCURRENTLY_CHANGED",
        "所选轨迹中有内容已被其他员工更新，本次批量操作未写入，请刷新后重新选择。",
        409,
      );
    }
    throw error;
  }

  return ok({ updated: annotations.length, annotations });
}
