import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "document.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  const canSeeAll =
    canRead.reasons.includes("SCOPE_ALL") ||
    canRead.reasons.includes("SCOPE_ALL_OK") ||
    canRead.reasons.includes("SCOPE_BUSINESS_UNIT_OK");
  const rows = await prisma.document.findMany({
    where: canSeeAll ? { businessUnitId: auth.membership.businessUnitId } : { ownerUserId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: { ownerUser: { select: { username: true, fullName: true } } },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "document.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canCreate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || typeof body.fileName !== "string" || typeof body.fileType !== "string") {
    return NextResponse.json({ error: "title, fileName, fileType are required." }, { status: 400 });
  }

  const fileSizeBytes = toPositiveInt(body.fileSizeBytes);
  if (fileSizeBytes === null) {
    return NextResponse.json({ error: "fileSizeBytes must be a non-negative integer." }, { status: 400 });
  }
  if (typeof body.storagePath !== "string") {
    return NextResponse.json({ error: "storagePath is required for path-traceable document record." }, { status: 400 });
  }

  const row = await prisma.document.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      departmentId: auth.membership.departmentId,
      siteId: auth.membership.siteId,
      ownerUserId: auth.userId,
      targetType: typeof body.targetType === "string" ? body.targetType : "misc",
      targetId: typeof body.targetId === "string" ? body.targetId : null,
      title: body.title,
      fileName: body.fileName,
      fileType: body.fileType,
      storagePath: body.storagePath,
      fileSizeBytes,
      checksum: typeof body.checksum === "string" ? body.checksum : null,
      metadata: typeof body.metadata === "object" && body.metadata !== null ? (body.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.documents",
    action: "document.create",
    targetType: "document",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { fileName: row.fileName },
  });

  return NextResponse.json(row);
}
