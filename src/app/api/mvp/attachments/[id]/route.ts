import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { fail, ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId, status: "ACTIVE" },
  });
  if (!attachment) return fail("NOT_FOUND", "附件不存在。", 404);
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attachment.delete",
    targetBusinessUnitId: attachment.businessUnitId,
    targetDepartmentId: attachment.departmentId,
  });
  if (!decision.allowed) return fail("NOT_FOUND", "附件不存在。", 404);
  await localDemoStorage.delete(attachment.storageKey);
  await prisma.attachment.update({ where: { id: attachment.id }, data: { status: "DELETED", deletedAt: new Date() } });
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
  });
  return ok({ deleted: attachment.id });
}
