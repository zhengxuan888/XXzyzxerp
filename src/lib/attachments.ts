import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const attachmentTargets = ["PRODUCT", "CONVERSATION", "SHIPMENT"] as const;
export type AttachmentTargetType = (typeof attachmentTargets)[number];

export async function resolveAttachmentTarget(auth: AuthContext, targetType: string, targetId: string) {
  if (targetType === "PRODUCT") {
    const product = await prisma.product.findFirst({
      where: { id: targetId, businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, businessUnitId: true },
    });
    return product
      ? { targetType: "PRODUCT" as const, targetId: product.id, businessUnitId: product.businessUnitId, departmentId: auth.membership.departmentId }
      : null;
  }
  if (targetType === "CONVERSATION") {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: targetId,
        businessUnitId: auth.membership.businessUnitId,
      },
      select: { id: true, businessUnitId: true, departmentId: true },
    });
    return conversation
      ? { targetType: "CONVERSATION" as const, targetId: conversation.id, businessUnitId: conversation.businessUnitId, departmentId: conversation.departmentId }
      : null;
  }
  if (targetType === "SHIPMENT") {
    const shipment = await prisma.shipment.findFirst({
      where: {
        id: targetId,
        businessUnitId: auth.membership.businessUnitId,
      },
      select: {
        id: true,
        status: true,
        businessUnitId: true,
        siteId: true,
      },
    });
    if (!shipment || shipment.status === "CANCELLED" || shipment.status === "CLOSED") return null;
    const site = shipment.siteId
      ? await prisma.site.findFirst({ where: { id: shipment.siteId, businessUnitId: auth.membership.businessUnitId }, select: { departmentId: true } })
      : null;
    return shipment
      ? {
          targetType: "SHIPMENT" as const,
          targetId: shipment.id,
          businessUnitId: shipment.businessUnitId,
          departmentId: site?.departmentId ?? auth.membership.departmentId,
        }
      : null;
  }
  return null;
}
