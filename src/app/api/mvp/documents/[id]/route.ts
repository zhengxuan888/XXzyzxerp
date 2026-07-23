import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const row = await prisma.document.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const canDelete = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "document.delete",
    targetBusinessUnitId: row.businessUnitId,
  });
  if (!canDelete.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });

  await prisma.document.delete({ where: { id: row.id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.documents",
    action: "document.delete",
    targetType: "document",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { fileName: row.fileName },
  });
  return NextResponse.json({ ok: true, deleted: row.id });
}
