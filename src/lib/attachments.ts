import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const attachmentTargets = ["PRODUCT", "CONVERSATION"] as const;
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
  return null;
}
