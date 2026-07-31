import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentVisibilityPlan } from "@/lib/document-center";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

export const runtime = "nodejs";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await props.params;
  const visibility = await createDocumentVisibilityPlan(auth);
  if (!visibility.readPlan.allowed) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const document = await prisma.document.findFirst({
    where: { AND: [{ id, businessUnitId: auth.membership.businessUnitId }, visibility.where] },
    select: {
      id: true,
      businessUnitId: true,
      departmentId: true,
      attachment: {
        select: {
          originalName: true,
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
  ) return NextResponse.json({ error: "DOCUMENT_CONTENT_UNAVAILABLE" }, { status: 404 });
  const bytes = await localDemoStorage.get(attachment.storageKey);
  if (!bytes) return NextResponse.json({ error: "STORED_OBJECT_MISSING" }, { status: 404 });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.documents",
    action: "document.content.read",
    targetType: "document",
    targetId: document.id,
    businessUnitId: document.businessUnitId,
    roleId: auth.membership.roleId,
    details: { mimeType: attachment.mimeType, sizeBytes: bytes.byteLength },
  });
  const disposition = attachment.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? "attachment" : "inline";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
