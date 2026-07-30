import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/mvp/shipments/[id]/events/[eventId]/annotation">,
) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id, eventId } = await context.params;
  const event = await prisma.shipmentEvent.findFirst({
    where: {
      id: eventId,
      shipmentId: id,
      shipment: { businessUnitId: auth.membership.businessUnitId },
    },
    include: {
      shipment: {
        select: {
          businessUnitId: true,
          siteId: true,
          order: { select: { departmentId: true, creatorUserId: true } },
        },
      },
    },
  });
  if (!event) return fail("TRACKING_EVENT_NOT_FOUND", "物流轨迹不存在。", 404);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.track.update",
    targetBusinessUnitId: event.shipment.businessUnitId,
    targetDepartmentId: event.shipment.order.departmentId,
    targetSiteId: event.shipment.siteId,
    targetUserId: event.shipment.order.creatorUserId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "无权处理该物流轨迹。", 403);

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (body?.isHandled === true && !note) return fail("TRACKING_NOTE_REQUIRED", "标记物流轨迹完成前必须填写备注。", 400);
  const tags: string[] = Array.isArray(body?.tags)
    ? [...new Set<string>(body.tags.filter((tag: unknown): tag is string => typeof tag === "string").map((tag: string) => tag.trim().slice(0, 30)).filter(Boolean))].slice(0, 10)
    : [];
  const isHandled = body?.isHandled === true;
  const annotation = await prisma.logisticsEventAnnotation.upsert({
    where: { shipmentEventId: event.id },
    update: {
      note: note || null,
      tags,
      isHandled,
      handledAt: isHandled ? new Date() : null,
      handledByMembershipId: isHandled ? auth.membership.id : null,
    },
    create: {
      shipmentId: id,
      shipmentEventId: event.id,
      businessUnitId: event.shipment.businessUnitId,
      note: note || null,
      tags,
      isHandled,
      handledAt: isHandled ? new Date() : null,
      handledByMembershipId: isHandled ? auth.membership.id : null,
    },
    include: { handledByMembership: { include: { user: { select: { username: true, fullName: true } } } } },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.event_annotation",
    action: "shipment.event.annotate",
    targetType: "shipment_event",
    targetId: event.id,
    businessUnitId: event.shipment.businessUnitId,
    roleId: auth.membership.roleId,
    details: { shipmentId: id, tags, isHandled, noteLength: note.length },
  });
  return ok(annotation);
}
