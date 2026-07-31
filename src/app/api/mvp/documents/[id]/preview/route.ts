import mammoth from "mammoth";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentVisibilityPlan } from "@/lib/document-center";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

export const runtime = "nodejs";

/**
 * DOCX is rendered as local raw text instead of injecting converted HTML or
 * sending a customer file to a third-party preview service. This is deliberate:
 * users can inspect its text safely while the original remains downloadable.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const visibility = await createDocumentVisibilityPlan(auth);
  if (!visibility.readPlan.allowed) return fail("DOCUMENT_NOT_FOUND", "文档不存在。", 404);
  const document = await prisma.document.findFirst({
    where: { AND: [{ id, businessUnitId: auth.membership.businessUnitId }, visibility.where] },
    select: {
      id: true,
      businessUnitId: true,
      departmentId: true,
      attachment: {
        select: {
          storageKey: true,
          mimeType: true,
          status: true,
          businessUnitId: true,
          departmentId: true,
          targetType: true,
          targetId: true,
        },
      },
    },
  });
  const attachment = document?.attachment;
  if (
    !document
    || !attachment
    || attachment.status !== "ACTIVE"
    || attachment.businessUnitId !== document.businessUnitId
    || attachment.departmentId !== document.departmentId
    || attachment.targetType !== "DOCUMENT"
    || attachment.targetId !== document.id
  ) return fail("DOCUMENT_CONTENT_UNAVAILABLE", "文档原件不可用。", 404);
  if (attachment.mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return fail("DOCUMENT_PREVIEW_UNSUPPORTED", "当前仅支持 Word 文档的本地文本预览。", 409);
  }
  const bytes = await localDemoStorage.get(attachment.storageKey);
  if (!bytes) return fail("STORED_OBJECT_MISSING", "文档原件不存在。", 404);
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const limit = 50_000;
    const text = result.value.slice(0, limit);
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.documents",
      action: "document.preview.read",
      targetType: "document",
      targetId: document.id,
      businessUnitId: document.businessUnitId,
      roleId: auth.membership.roleId,
      details: { kind: "DOCX_TEXT", truncated: result.value.length > limit, warningCount: result.messages.length },
    });
    return ok({ kind: "TEXT", text, truncated: result.value.length > limit, warningCount: result.messages.length });
  } catch {
    return fail("DOCUMENT_PREVIEW_FAILED", "文档无法安全解析预览，请下载原件查看。", 422);
  }
}
