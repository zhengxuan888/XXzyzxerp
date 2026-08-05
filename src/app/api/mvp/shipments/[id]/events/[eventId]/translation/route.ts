import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { trackingTextHash } from "@/lib/tracking-translation-service";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; eventId: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id, eventId } = await context.params;
  const event = await prisma.shipmentEvent.findFirst({ where: { id: eventId, shipmentId: id, shipment: { businessUnitId: auth.membership.businessUnitId } }, include: { shipment: { select: { businessUnitId: true, siteId: true, order: { select: { departmentId: true, creatorUserId: true, ownedByMembershipId: true } } } } } });
  if (!event?.memo) return fail("TRACKING_EVENT_NOT_FOUND", "物流轨迹原文不存在。", 404);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.track.update", targetBusinessUnitId: event.shipment.businessUnitId, targetDepartmentId: event.shipment.order.departmentId, targetSiteId: event.shipment.siteId, targetUserId: event.shipment.order.creatorUserId, targetMembershipId: event.shipment.order.ownedByMembershipId });
  if (!permission.allowed) return fail("FORBIDDEN", "无权核对该物流轨迹。", 403);
  const body = await request.json().catch(() => null);
  const translatedText = typeof body?.translatedText === "string" ? body.translatedText.trim().slice(0, 1000) : "";
  if (!translatedText) return fail("TRANSLATION_REQUIRED", "请填写人工核对后的中文。", 400);
  const sourceText = event.memo.trim(); const sourceHash = trackingTextHash(sourceText);
  const row = await prisma.trackingTranslation.upsert({ where: { businessUnitId_sourceHash: { businessUnitId: event.shipment.businessUnitId, sourceHash } }, create: { businessUnitId: event.shipment.businessUnitId, sourceHash, sourceText, translatedText, provider: "MANUAL_VERIFIED" }, update: { translatedText, provider: "MANUAL_VERIFIED", lastUsedAt: new Date(), useCount: { increment: 1 } } });
  return ok({ translatedText: row.translatedText, provider: row.provider });
}
