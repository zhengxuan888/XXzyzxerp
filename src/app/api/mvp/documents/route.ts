import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentVisibilityPlan, parseReviewStatus, textQuery } from "@/lib/document-center";
import { createDocumentAccessPlan } from "@/lib/document-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { validateUpload } from "@/lib/storage/file-validation";
import { localDemoStorage } from "@/lib/storage/local-demo";

export const runtime = "nodejs";

const documentSelect = {
  id: true,
  businessUnitId: true,
  departmentId: true,
  siteId: true,
  ownerUserId: true,
  title: true,
  targetType: true,
  targetId: true,
  fileName: true,
  fileType: true,
  fileSizeBytes: true,
  checksum: true,
  reviewStatus: true,
  reviewNote: true,
  reviewedAt: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
  ownerUser: { select: { username: true, fullName: true } },
  ownerMembership: { select: { id: true, departmentId: true } },
  reviewedByMembership: { select: { id: true, user: { select: { fullName: true, username: true } } } },
  attachment: { select: { id: true, originalName: true, mimeType: true, extension: true, sizeBytes: true, sha256: true, status: true } },
} as const;

function validTargetType(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "GENERAL").trim().toUpperCase() || "GENERAL";
  return /^[A-Z][A-Z0-9_]{0,47}$/.test(normalized) ? normalized : null;
}

function requiredTitle(value: FormDataEntryValue | null) {
  const title = String(value ?? "").trim();
  return title.length >= 1 && title.length <= 160 ? title : null;
}

function documentTarget(row: {
  businessUnitId: string;
  departmentId?: string | null;
  siteId?: string | null;
  ownerUserId: string;
  ownerMembership: { id: string } | null;
}) {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId ?? null,
    siteId: row.siteId ?? null,
    ownerUserId: row.ownerUserId,
    ownerMembershipId: row.ownerMembership?.id ?? null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const [visibility, archivePlan] = await Promise.all([
    createDocumentVisibilityPlan(auth),
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.archive" }),
  ]);
  if (!visibility.readPlan.allowed) return fail("FORBIDDEN", "没有文档查看权限。", 403);

  const query = textQuery(request.nextUrl.searchParams.get("q"));
  const requestedStatus = request.nextUrl.searchParams.get("status");
  const reviewStatus = parseReviewStatus(requestedStatus);
  if (requestedStatus && requestedStatus !== "ALL" && !reviewStatus) {
    return fail("INVALID_REVIEW_STATUS", "文档状态筛选无效。", 400);
  }
  const categoryId = textQuery(request.nextUrl.searchParams.get("categoryId"), 80);
  const mine = request.nextUrl.searchParams.get("mine") === "true";
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const requestedPageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 20);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 100) : 20;
  const where = {
    AND: [
      visibility.where,
      ...(reviewStatus ? [{ reviewStatus }] : []),
      ...(categoryId ? [{ categoryId }] : []),
      ...(mine ? [{ OR: [{ ownerMembershipId: auth.membership.id }, { ownerMembershipId: null, ownerUserId: auth.userId }] }] : []),
      ...(query
        ? [{
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { fileName: { contains: query, mode: "insensitive" as const } },
              { ownerUser: { fullName: { contains: query, mode: "insensitive" as const } } },
              { ownerUser: { username: { contains: query, mode: "insensitive" as const } } },
            ],
          }]
        : []),
    ],
  };
  const [items, total, pending, approved, rejected] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      select: documentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
    prisma.document.count({ where: { AND: [where, { reviewStatus: "PENDING_REVIEW" }] } }),
    prisma.document.count({ where: { AND: [where, { reviewStatus: "APPROVED" }] } }),
    prisma.document.count({ where: { AND: [where, { reviewStatus: "REJECTED" }] } }),
  ]);
  return NextResponse.json({
    ok: true,
    data: items.map((item) => {
      const target = documentTarget(item);
      return {
        ...item,
        canReview: item.reviewStatus === "PENDING_REVIEW" && visibility.readPlan.allows(target) && visibility.reviewPlan.allows(target),
        canArchive: item.reviewStatus !== "ARCHIVED" && visibility.readPlan.allows(target) && archivePlan.allows(target),
      };
    }),
    meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    summary: {
      total,
      pending,
      approved,
      rejected,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "document.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetUserId: auth.userId,
  });
  if (!canCreate.allowed) return fail("FORBIDDEN", "没有上传文档权限。", 403, canCreate.reasons);

  const form = await request.formData().catch(() => null);
  const title = requiredTitle(form?.get("title") ?? null);
  const targetType = validTargetType(form?.get("targetType") ?? null);
  const targetId = textQuery(String(form?.get("targetId") ?? ""), 120) || null;
  const categoryId = textQuery(String(form?.get("categoryId") ?? ""), 80) || null;
  const file = form?.get("file");
  if (!title) return fail("INVALID_TITLE", "请填写 1–160 个字符的文档标题。", 400);
  if (!targetType) return fail("INVALID_TARGET_TYPE", "文档关联类型无效。", 400);
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return fail("FILE_REQUIRED", "请选择要上传的文件。", 400);
  }
  if (file.size > 50 * 1024 * 1024) return fail("FILE_SIZE_LIMIT_EXCEEDED", "文件超过允许大小。", 413);

  if (categoryId) {
    const category = await prisma.documentCategory.findFirst({
      where: { id: categoryId, businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true },
    });
    if (!category) return fail("DOCUMENT_CATEGORY_NOT_FOUND", "文档分类不存在或已停用。", 400);
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

  const documentId = randomUUID();
  try {
    await localDemoStorage.put({ storageKey: validated.storageKey, bytes });
  } catch {
    return fail("DOCUMENT_STORAGE_WRITE_FAILED", "文件暂时无法安全保存，请稍后重试。", 503);
  }
  try {
    const document = await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          departmentId: auth.membership.departmentId,
          targetType: "DOCUMENT",
          targetId: documentId,
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
      });
      const created = await tx.document.create({
        data: {
          id: documentId,
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          departmentId: auth.membership.departmentId,
          siteId: auth.membership.siteId,
          ownerUserId: auth.userId,
          ownerMembershipId: auth.membership.id,
          categoryId,
          attachmentId: attachment.id,
          targetType,
          targetId,
          title,
          fileName: validated.originalName,
          fileType: validated.mimeType,
          storagePath: attachment.storageKey,
          fileSizeBytes: validated.sizeBytes,
          checksum: validated.sha256,
          reviewStatus: "PENDING_REVIEW",
        },
        select: documentSelect,
      });
      await writeAuditLog(
        {
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          module: "mvp.documents",
          action: "document.create",
          targetType: "document",
          targetId: created.id,
          businessUnitId: created.businessUnitId,
          roleId: auth.membership.roleId,
          details: { categoryId, fileType: validated.mimeType, sizeBytes: validated.sizeBytes, sha256: validated.sha256 },
        },
        tx,
      );
      return created;
    });
    return new Response(JSON.stringify({ ok: true, data: document }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await localDemoStorage.delete(validated.storageKey);
    throw error;
  }
}
