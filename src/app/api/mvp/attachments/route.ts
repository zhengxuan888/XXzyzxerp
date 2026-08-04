import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { fail, ok } from "@/lib/api-response";
import { hasTargetBusinessAttachmentPermission, resolveAttachmentTarget } from "@/lib/attachments";
import { validateUpload } from "@/lib/storage/file-validation";
import { localDemoStorage } from "@/lib/storage/local-demo";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const safeSelect = {
  id: true,
  targetType: true,
  targetId: true,
  originalName: true,
  mimeType: true,
  extension: true,
  sizeBytes: true,
  sha256: true,
  status: true,
  createdAt: true,
  uploadedByUser: { select: { fullName: true } },
} as const;

function targetActionKey(targetType: string, fallback: "attachment.read" | "attachment.create") {
  if (fallback === "attachment.read") return fallback;
  if (targetType === "ORDER") return "order.update";
  if (targetType === "ORDER_REVIEW") return "order.review.proof.upload";
  if (targetType === "SHIPMENT") return "order.ship";
  return fallback;
}

async function authorizeTarget(request: NextRequest, actionKey: string, targetType: string, targetId: string) {
  const auth = await requireAuthContext(request);
  if (!auth) return { response: fail("UNAUTHENTICATED", "请先登录。", 401) };
  const target = await resolveAttachmentTarget(auth, targetType, targetId);
  if (!target) return { response: fail("TARGET_NOT_FOUND", "资源不存在。", 404) };
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: targetActionKey(targetType, actionKey as "attachment.read" | "attachment.create"),
    targetBusinessUnitId: target.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.ownerUserId,
    targetMembershipId: target.ownerMembershipId,
  });
  if (!decision.allowed) return { response: fail("FORBIDDEN", "没有附件操作权限。", 403, decision.reasons) };
  if (!(await hasTargetBusinessAttachmentPermission(auth, target, actionKey as "attachment.read" | "attachment.create"))) {
    return { response: fail("FORBIDDEN", "没有目标业务记录的附件操作权限。", 403) };
  }
  return { auth, target };
}

export async function GET(request: NextRequest) {
  const targetType = request.nextUrl.searchParams.get("targetType")?.trim().toUpperCase() ?? "";
  const targetId = request.nextUrl.searchParams.get("targetId")?.trim() ?? "";
  const access = await authorizeTarget(request, "attachment.read", targetType, targetId);
  if ("response" in access) return access.response;
  const items = await prisma.attachment.findMany({
    where: {
      businessUnitId: access.target.businessUnitId,
      departmentId: access.target.departmentId,
      targetType: access.target.targetType,
      targetId: access.target.targetId,
      status: "ACTIVE",
    },
    select: safeSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return ok(items);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const form = await request.formData().catch(() => null);
  const targetType = String(form?.get("targetType") ?? "").trim().toUpperCase();
  const targetId = String(form?.get("targetId") ?? "").trim();
  const target = await resolveAttachmentTarget(auth, targetType, targetId);
  if (!target) return fail("TARGET_NOT_FOUND", "资源不存在。", 404);
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: targetActionKey(targetType, "attachment.create"),
    targetBusinessUnitId: target.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.ownerUserId,
    targetMembershipId: target.ownerMembershipId,
  });
  if (!decision.allowed) return fail("FORBIDDEN", "没有附件操作权限。", 403, decision.reasons);
  if (!(await hasTargetBusinessAttachmentPermission(auth, target, "attachment.create"))) {
    return fail("FORBIDDEN", "没有目标业务记录的附件上传权限。", 403);
  }
  if (targetType === "ORDER_REVIEW") {
    const reviewOrder = await prisma.order.findFirst({
      where: { id: targetId, businessUnitId: auth.membership.businessUnitId },
      select: { status: true },
    });
    if (!reviewOrder || reviewOrder.status !== "SUBMITTED") {
      return fail("ORDER_NOT_REVIEWABLE", "订单当前不在核单阶段。", 409);
    }
  }
  if (targetType === "SHIPMENT") {
    const shipment = await prisma.shipment.findFirst({
      where: { id: targetId, businessUnitId: auth.membership.businessUnitId },
      select: { status: true, trackingNo: true },
    });
    if (!shipment || shipment.status !== "PENDING") {
      return fail("SHIPMENT_PROOF_LOCKED", "订单已确认发货，发货凭证已锁定。", 409);
    }
    if (!shipment.trackingNo) {
      return fail("TRACKING_NO_REQUIRED", "请先回填真实物流单号，再上传发货凭证。", 409);
    }
  }
  const file = form?.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return fail("FILE_REQUIRED", "请选择需要上传的文件。", 400);
  }
  if (file.size > 50 * 1024 * 1024) return fail("FILE_SIZE_LIMIT_EXCEEDED", "文件超过允许大小。", 413);
  const requestedPurpose = String(form?.get("purpose") ?? "PRIMARY").trim().toUpperCase();
  if (target.targetType === "MARKETING_CREATIVE" && !["PRIMARY", "SUPPORTING", "COPY_REFERENCE"].includes(requestedPurpose)) {
    return fail("INVALID_ATTACHMENT_PURPOSE", "素材附件用途不正确。", 400);
  }
  const requestedSortOrder = Number(form?.get("sortOrder") ?? 0);
  if (!Number.isInteger(requestedSortOrder) || requestedSortOrder < 0 || requestedSortOrder > 100000) {
    return fail("INVALID_ATTACHMENT_SORT_ORDER", "素材附件排序不正确。", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated;
  try {
    validated = validateUpload({ originalName: file.name, declaredMime: file.type, bytes });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_FILE";
    const status = code === "FILE_SIZE_LIMIT_EXCEEDED" ? 413 : 400;
    return fail(code, "文件类型、扩展名、签名或大小不符合安全规则。", status);
  }

  try {
    await localDemoStorage.put({ storageKey: validated.storageKey, bytes });
  } catch {
    return fail("ATTACHMENT_STORAGE_WRITE_FAILED", "文件暂时无法安全保存，请稍后重试。", 503);
  }
  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: target.businessUnitId,
          departmentId: target.departmentId,
          targetType: target.targetType,
          targetId: target.targetId,
          originalName: validated.originalName,
          storageProvider: localDemoStorage.providerKey,
          storageKey: validated.storageKey,
          mimeType: validated.mimeType,
          extension: validated.extension,
          sizeBytes: validated.sizeBytes,
          sha256: validated.sha256,
          uploadedByUserId: auth.userId,
          uploadedByMembershipId: auth.membership.id,
        },
        select: safeSelect,
      });
      if (target.targetType === "MARKETING_CREATIVE") {
        await tx.marketingCreativeAttachment.create({
          data: {
            creativeId: target.targetId,
            attachmentId: created.id,
            purpose: requestedPurpose as "PRIMARY" | "SUPPORTING" | "COPY_REFERENCE",
            sortOrder: requestedSortOrder,
          },
        });
      }
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.attachments",
        action: "attachment.create",
        targetType: target.targetType.toLowerCase(),
        targetId: target.targetId,
        businessUnitId: target.businessUnitId,
        roleId: auth.membership.roleId,
        details: {
          attachmentId: created.id,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes,
          sha256: created.sha256,
        },
      }, tx);
      return created;
    });
    return ok(attachment, { status: 201 });
  } catch (error) {
    await localDemoStorage.delete(validated.storageKey);
    throw error;
  }
}
