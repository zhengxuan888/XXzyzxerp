import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";
import {
  hasTargetBusinessAttachmentPermission,
  isStoredAttachmentTargetConsistent,
  resolveCanonicalAttachmentTarget,
  storedAttachmentPermissionTarget,
} from "@/lib/attachments";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await props.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId, status: "ACTIVE" },
  });
  if (!attachment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const target = await resolveCanonicalAttachmentTarget(auth, attachment.targetType, attachment.targetId);
  if (!target || !isStoredAttachmentTargetConsistent(attachment, target)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const scope = storedAttachmentPermissionTarget(attachment, target);
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attachment.read",
    targetBusinessUnitId: scope.businessUnitId,
    targetDepartmentId: scope.departmentId,
    targetSiteId: scope.siteId,
    targetUserId: scope.ownerUserId,
    targetMembershipId: scope.ownerMembershipId,
  });
  if (!decision.allowed) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await hasTargetBusinessAttachmentPermission(auth, target, "attachment.read"))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const bytes = await localDemoStorage.get(attachment.storageKey);
  if (!bytes) return NextResponse.json({ error: "STORED_OBJECT_MISSING" }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
