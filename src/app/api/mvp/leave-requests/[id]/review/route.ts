import { NextRequest, NextResponse } from "next/server";

import { LeaveStatus } from "@prisma/client";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

function parseReviewStatus(value: unknown): LeaveStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "APPROVED" || normalized === "REJECTED" || normalized === "CANCELED") {
    return normalized as LeaveStatus;
  }
  return null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  const { id } = await props.params;

  const row = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });

  const canReview = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "leave_request.approve",
    targetBusinessUnitId: row.businessUnitId,
  });
  if (!canReview.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canReview.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Request body required." }, { status: 400 });
  const status = parseReviewStatus(body.status);
  if (!status) return NextResponse.json({ error: "status must be APPROVED, REJECTED, or CANCELED." }, { status: 400 });
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending leave requests can be reviewed." }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      approverMembershipId: auth.membership.id,
      rejectReason: status === "REJECTED" ? String(body.rejectReason || "Rejected") : row.rejectReason ?? null,
      updatedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.leave-requests",
    action: "leave_request.approve",
    targetType: "leave_request",
    targetId: updated.id,
    businessUnitId: updated.businessUnitId,
    roleId: auth.membership.roleId,
    details: { status },
  });

  return NextResponse.json(updated);
}
