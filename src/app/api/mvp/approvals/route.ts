import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginated, parsePagination } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "approval.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) {
    return NextResponse.json(
      { error: "FORBIDDEN", reasons: canRead.reasons },
      { status: 403 },
    );
  }

  const shouldReadAll =
    canRead.reasons.includes("SCOPE_ALL") ||
    canRead.reasons.includes("SCOPE_ALL_OK") ||
    canRead.reasons.includes("SCOPE_BUSINESS_UNIT_OK");

  const pagination = parsePagination(request);
  const where = shouldReadAll
    ? { businessUnitId: auth.membership.businessUnitId }
    : { businessUnitId: auth.membership.businessUnitId, submittedBy: { userId: auth.userId } };
  const [rows, total] = await prisma.$transaction([
    prisma.approvalRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        submittedBy: { select: { id: true, userId: true } },
        approver: { select: { id: true, userId: true } },
      },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.approvalRecord.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canSubmit = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "approval.submit",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canSubmit.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canSubmit.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.targetType !== "string" || typeof body.targetId !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "targetType, targetId, action required." }, { status: 400 });
  }

  const row = await prisma.approvalRecord.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      targetType: String(body.targetType),
      targetId: String(body.targetId),
      action: String(body.action),
      status: "PENDING",
      submittedByMembershipId: auth.membership.id,
      reason: typeof body.reason === "string" ? body.reason : null,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.approvals",
    action: "approval.submit",
    targetType: "approval",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { targetType: row.targetType, targetId: row.targetId },
  });

  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const row = await prisma.approvalRecord.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Approval not found." }, { status: 404 });

  const canDelete = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "approval.review",
    targetBusinessUnitId: row.businessUnitId,
  });
  if (!canDelete.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });

  if (row.status === "APPROVED" || row.status === "REJECTED") {
    return NextResponse.json({ error: "Only pending approvals can be revoked." }, { status: 400 });
  }

  await prisma.approvalRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: id });
}
