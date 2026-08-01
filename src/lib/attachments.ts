import type { AuthContext } from "@/lib/api-auth";
import { createMarketingCreativeAccessPlan } from "@/lib/marketing-access";
import { prisma } from "@/lib/prisma";

export const attachmentTargets = ["PRODUCT", "ORDER", "ORDER_REVIEW", "CONVERSATION", "SHIPMENT", "MARKETING_CREATIVE"] as const;
export type AttachmentTargetType = (typeof attachmentTargets)[number];

export type CanonicalAttachmentTarget = {
  targetType: AttachmentTargetType;
  targetId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  ownerUserId: string | null;
  // Older attachment target callers do not have a Membership concept. It is
  // optional for those legacy target types, but required at runtime for a
  // marketing creative before its binary can be accessed.
  ownerMembershipId?: string | null;
};

type StoredAttachmentScope = {
  businessUnitId: string;
  departmentId: string | null;
  uploadedByUserId: string;
};

/**
 * A creation flow may assign an actor department to a legacy target that has
 * no own department. After persistence, that stored boundary is authoritative:
 * an accessing actor must never substitute their own department for it.
 */
export function isStoredAttachmentTargetConsistent(
  attachment: StoredAttachmentScope,
  target: CanonicalAttachmentTarget,
) {
  if (attachment.businessUnitId !== target.businessUnitId) return false;
  return target.departmentId === null || attachment.departmentId === target.departmentId;
}

export function storedAttachmentPermissionTarget(
  attachment: StoredAttachmentScope,
  target: CanonicalAttachmentTarget,
) {
  return {
    businessUnitId: attachment.businessUnitId,
    departmentId: attachment.departmentId,
    siteId: target.siteId,
    ownerUserId: target.ownerUserId ?? attachment.uploadedByUserId,
    ...(target.ownerMembershipId ? { ownerMembershipId: target.ownerMembershipId } : {}),
  };
}

/**
 * Attachments inherit both the generic file permission and the business
 * permission of their target. This closes the common "file URL bypass" where
 * a user could otherwise read a secure attachment without permission to the
 * marketing record that owns it.
 */
export async function hasTargetBusinessAttachmentPermission(
  auth: AuthContext,
  target: CanonicalAttachmentTarget,
  attachmentAction: "attachment.read" | "attachment.create" | "attachment.delete",
) {
  if (target.targetType !== "MARKETING_CREATIVE") return true;
  if (!target.ownerMembershipId) return false;
  const actionKey = attachmentAction === "attachment.read" ? "marketing.creative.read" : "marketing.creative.update";
  const access = await createMarketingCreativeAccessPlan({ membership: auth.membership, actionKey });
  return access.allowed && access.allows({
    businessUnitId: target.businessUnitId,
    departmentId: target.departmentId,
    siteId: target.siteId,
    ownerMembershipId: target.ownerMembershipId,
  });
}

async function resolveAttachmentTargetInternal(
  auth: AuthContext,
  targetType: string,
  targetId: string,
  allowActorDepartmentFallback: boolean,
): Promise<CanonicalAttachmentTarget | null> {
  const actorDepartmentId = allowActorDepartmentFallback ? auth.membership.departmentId : null;

  if (targetType === "PRODUCT") {
    const product = await prisma.product.findFirst({
      where: { id: targetId, businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, businessUnitId: true },
    });
    return product
      ? {
          targetType: "PRODUCT",
          targetId: product.id,
          businessUnitId: product.businessUnitId,
          departmentId: actorDepartmentId,
          siteId: null,
          ownerUserId: null,
          ownerMembershipId: null,
        }
      : null;
  }
  if (targetType === "ORDER" || targetType === "ORDER_REVIEW") {
    const order = await prisma.order.findFirst({
      where: {
        id: targetId,
        businessUnitId: auth.membership.businessUnitId,
      },
      select: { id: true, businessUnitId: true, departmentId: true, siteId: true, creatorUserId: true },
    });
    return order
      ? {
          targetType: targetType as "ORDER" | "ORDER_REVIEW",
          targetId: order.id,
          businessUnitId: order.businessUnitId,
          departmentId: order.departmentId ?? actorDepartmentId,
          siteId: order.siteId,
          ownerUserId: order.creatorUserId,
          ownerMembershipId: null,
        }
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
      ? {
          targetType: "CONVERSATION",
          targetId: conversation.id,
          businessUnitId: conversation.businessUnitId,
          departmentId: conversation.departmentId ?? actorDepartmentId,
          siteId: null,
          ownerUserId: null,
          ownerMembershipId: null,
        }
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
        order: { select: { departmentId: true, creatorUserId: true } },
      },
    });
    if (!shipment || shipment.status === "CANCELLED" || shipment.status === "CLOSED") return null;
    return shipment
      ? {
          targetType: "SHIPMENT" as const,
          targetId: shipment.id,
          businessUnitId: shipment.businessUnitId,
          departmentId: shipment.order.departmentId ?? actorDepartmentId,
          siteId: shipment.siteId,
          ownerUserId: shipment.order.creatorUserId,
          ownerMembershipId: null,
        }
      : null;
  }
  if (targetType === "MARKETING_CREATIVE") {
    const creative = await prisma.marketingCreative.findFirst({
      where: { id: targetId, businessUnitId: auth.membership.businessUnitId },
      select: { id: true, businessUnitId: true, departmentId: true, siteId: true, createdByUserId: true, ownerMembershipId: true, isArchived: true },
    });
    if (!creative || creative.isArchived) return null;
    return {
      targetType: "MARKETING_CREATIVE",
      targetId: creative.id,
      businessUnitId: creative.businessUnitId,
      departmentId: creative.departmentId ?? actorDepartmentId,
      siteId: creative.siteId,
      ownerUserId: creative.createdByUserId,
      ownerMembershipId: creative.ownerMembershipId,
    };
  }
  return null;
}

/** Existing upload/list flows retain their compatible actor fallback. */
export async function resolveAttachmentTarget(auth: AuthContext, targetType: string, targetId: string) {
  return resolveAttachmentTargetInternal(auth, targetType, targetId, true);
}

/** Existing stored files must be resolved without an actor-scope fallback. */
export async function resolveCanonicalAttachmentTarget(auth: AuthContext, targetType: string, targetId: string) {
  return resolveAttachmentTargetInternal(auth, targetType, targetId, false);
}
