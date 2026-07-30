import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { fail, ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";
import { writeAuditLog } from "@/lib/audit";
import { resolveAttachmentTarget } from "@/lib/attachments";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId, status: "ACTIVE" },
  });
  if (!attachment) return fail("NOT_FOUND", "附件不存在。", 404);
  const target = await resolveAttachmentTarget(auth, attachment.targetType, attachment.targetId);
  if (!target) return fail("NOT_FOUND", "附件不存在。", 404);
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attachment.delete",
    targetBusinessUnitId: target.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.ownerUserId,
  });
  if (!decision.allowed) return fail("NOT_FOUND", "附件不存在。", 404);
  if (attachment.targetType === "ORDER_REVIEW") {
    const reviewOrder = await prisma.order.findFirst({
      where: { id: attachment.targetId, businessUnitId: auth.membership.businessUnitId },
      select: { status: true, reviewClaimedByMembershipId: true },
    });
    if (!reviewOrder || reviewOrder.status !== "SUBMITTED") {
      return fail("REVIEW_PROOF_LOCKED", "核单完成后的凭证已锁定，不能删除。", 409);
    }
    if (
      reviewOrder.reviewClaimedByMembershipId !== auth.membership.id
      || attachment.uploadedByMembershipId !== auth.membership.id
    ) {
      return fail("FORBIDDEN", "只能由当前领取人删除自己上传的核单凭证。", 403);
    }
  }
  if (attachment.targetType === "SHIPMENT") {
    const shipment = await prisma.shipment.findFirst({
      where: { id: attachment.targetId, businessUnitId: auth.membership.businessUnitId },
      select: { status: true },
    });
    if (!shipment || shipment.status !== "PENDING") {
      return fail("SHIPMENT_PROOF_LOCKED", "确认发货后的出货凭证已锁定，不能删除。", 409);
    }
    if (attachment.uploadedByMembershipId !== auth.membership.id) {
      return fail("FORBIDDEN", "只能删除自己上传的出货凭证。", 403);
    }
  }
  const deleted = await prisma.$transaction(async (tx) => {
    const updated = await tx.attachment.updateMany({
      where: {
        id: attachment.id,
        businessUnitId: attachment.businessUnitId,
        status: "ACTIVE",
      },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (updated.count !== 1) return false;
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.attachments",
      action: "attachment.delete",
      targetType: attachment.targetType.toLowerCase(),
      targetId: attachment.targetId,
      businessUnitId: attachment.businessUnitId,
      roleId: auth.membership.roleId,
      details: { attachmentId: attachment.id, sha256: attachment.sha256 },
    }, tx);
    return true;
  });
  if (!deleted) return fail("ATTACHMENT_DELETE_CONFLICT", "附件刚刚已被其他人处理，请刷新后重试。", 409);
  await localDemoStorage.delete(attachment.storageKey);
  return ok({ deleted: attachment.id });
}
