import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentAccessPlan } from "@/lib/document-access";
import { prisma } from "@/lib/prisma";

function operationBody(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function expectedVersion(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function documentTarget(row: { businessUnitId: string; departmentId: string | null; siteId: string | null; ownerUserId: string; ownerMembershipId: string | null }) {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    ownerUserId: row.ownerUserId,
    ownerMembershipId: row.ownerMembershipId,
  };
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const body = operationBody(await request.json().catch(() => null));
  const operation = body?.operation;
  const version = expectedVersion(body?.version);
  if (version === null) return fail("DOCUMENT_VERSION_REQUIRED", "请刷新后重试，缺少文档版本号。", 400);
  if (operation !== "review" && operation !== "archive") return fail("INVALID_DOCUMENT_OPERATION", "不支持的文档操作。", 400);

  const document = await prisma.document.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: {
      id: true,
      legalEntityId: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      ownerUserId: true,
      ownerMembershipId: true,
      reviewStatus: true,
      archivedAt: true,
      version: true,
      fileName: true,
    },
  });
  if (!document) return fail("DOCUMENT_NOT_FOUND", "文档不存在。", 404);

  const actionKey = operation === "review" ? "document.review" : "document.archive";
  const [readPlan, plan] = await Promise.all([
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.read" }),
    createDocumentAccessPlan({ membership: auth.membership, actionKey }),
  ]);
  if (!readPlan.allowed || !readPlan.allows(documentTarget(document)) || !plan.allowed || !plan.allows(documentTarget(document))) {
    return fail("FORBIDDEN", "没有操作此文档的权限。", 403);
  }

  if (operation === "review") {
    const reviewStatus = body?.reviewStatus;
    if (reviewStatus !== "APPROVED" && reviewStatus !== "REJECTED") {
      return fail("INVALID_DOCUMENT_REVIEW_STATUS", "审核结果只能为通过或退回。", 400);
    }
    const reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote.trim().slice(0, 800) : null;
    if (reviewStatus === "REJECTED" && !reviewNote) return fail("REVIEW_NOTE_REQUIRED", "退回文档时请填写原因。", 400);
    if (document.reviewStatus !== "PENDING_REVIEW" || document.archivedAt) {
      return fail("DOCUMENT_REVIEW_LOCKED", "该文档当前不能再审核。", 409);
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: {
          id: document.id,
          businessUnitId: document.businessUnitId,
          reviewStatus: "PENDING_REVIEW",
          archivedAt: null,
          version,
        },
        data: {
          reviewStatus,
          reviewedAt: new Date(),
          reviewedByMembershipId: auth.membership.id,
          reviewNote,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return null;
      await writeAuditLog(
        {
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          module: "mvp.documents",
          action: reviewStatus === "APPROVED" ? "document.review.approve" : "document.review.reject",
          targetType: "document",
          targetId: document.id,
          businessUnitId: document.businessUnitId,
          roleId: auth.membership.roleId,
          // Keep a verifiable review trail without copying potentially sensitive
          // document comments into a broadly readable audit payload.
          details: {
            fromStatus: document.reviewStatus,
            toStatus: reviewStatus,
            reviewNoteProvided: Boolean(reviewNote),
            reviewNoteLength: reviewNote?.length ?? 0,
          },
        },
        tx,
      );
      return tx.document.findUnique({
        where: { id: document.id },
        select: { id: true, reviewStatus: true, reviewedAt: true, reviewNote: true, version: true, archivedAt: true },
      });
    });
    if (!updated) return fail("DOCUMENT_CONFLICT", "文档刚刚被其他人处理，请刷新后重试。", 409);
    return ok(updated);
  }

  if (document.archivedAt || document.reviewStatus === "ARCHIVED") return fail("DOCUMENT_ALREADY_ARCHIVED", "文档已经归档。", 409);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.document.updateMany({
      where: { id: document.id, businessUnitId: document.businessUnitId, archivedAt: null, version },
      data: { reviewStatus: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    await writeAuditLog(
      {
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.documents",
        action: "document.archive",
        targetType: "document",
        targetId: document.id,
        businessUnitId: document.businessUnitId,
        roleId: auth.membership.roleId,
        details: { fileName: document.fileName },
      },
      tx,
    );
    return tx.document.findUnique({
      where: { id: document.id },
      select: { id: true, reviewStatus: true, archivedAt: true, version: true },
    });
  });
  if (!updated) return fail("DOCUMENT_CONFLICT", "文档刚刚被其他人处理，请刷新后重试。", 409);
  return ok(updated);
}

/**
 * Legacy clients used DELETE for documents. Keep the route but convert it to
 * auditable soft archive; physical deletion is no longer part of this module.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const document = await prisma.document.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, businessUnitId: true, departmentId: true, siteId: true, ownerUserId: true, ownerMembershipId: true, archivedAt: true, version: true, fileName: true },
  });
  if (!document) return fail("DOCUMENT_NOT_FOUND", "文档不存在。", 404);
  const [readPlan, plan] = await Promise.all([
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.read" }),
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.archive" }),
  ]);
  if (!readPlan.allowed || !readPlan.allows(documentTarget(document)) || !plan.allowed || !plan.allows(documentTarget(document))) {
    return fail("FORBIDDEN", "没有归档此文档的权限。", 403);
  }
  if (document.archivedAt) return fail("DOCUMENT_ALREADY_ARCHIVED", "文档已经归档。", 409);
  const archived = await prisma.$transaction(async (tx) => {
    const result = await tx.document.updateMany({
      where: { id: document.id, businessUnitId: document.businessUnitId, archivedAt: null, version: document.version },
      data: { reviewStatus: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    await writeAuditLog(
      {
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.documents",
        action: "document.archive",
        targetType: "document",
        targetId: document.id,
        businessUnitId: document.businessUnitId,
        roleId: auth.membership.roleId,
        details: { legacyDeleteRoute: true, fileName: document.fileName },
      },
      tx,
    );
    return true;
  });
  if (!archived) return fail("DOCUMENT_CONFLICT", "文档刚刚被其他人处理，请刷新后重试。", 409);
  return ok({ archived: document.id });
}
