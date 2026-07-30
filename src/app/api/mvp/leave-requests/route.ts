import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginated, parsePagination } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canApprove = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "leave_request.approve",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  const canSubmit = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "leave_request.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetUserId: auth.userId,
  });
  if (!canApprove.allowed && !canSubmit.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: [...canApprove.reasons, ...canSubmit.reasons] }, { status: 403 });
  }

  const shouldReadAll =
    canApprove.reasons.includes("SCOPE_ALL") ||
    canApprove.reasons.includes("SCOPE_ALL_OK") ||
    canApprove.reasons.includes("SCOPE_BUSINESS_UNIT_OK");
  const pagination = parsePagination(request);
  const where = shouldReadAll
    ? { businessUnitId: auth.membership.businessUnitId }
    : { businessUnitId: auth.membership.businessUnitId, membershipId: auth.membership.id };
  const [rows, total] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canSubmit = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "leave_request.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetUserId: auth.userId,
  });
  if (!canSubmit.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canSubmit.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.startDate !== "string" || typeof body.endDate !== "string" || typeof body.reason !== "string") {
    return NextResponse.json({ error: "startDate, endDate and reason are required." }, { status: 400 });
  }
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const row = await prisma.leaveRequest.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      membershipId: auth.membership.id,
      startDate,
      endDate,
      reason: body.reason,
      status: "PENDING",
      rejectReason: typeof body.rejectReason === "string" ? body.rejectReason : null,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.leave-requests",
    action: "leave_request.create",
    targetType: "leave_request",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString() },
  });

  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const row = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });

  const canDelete = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: row.status === "PENDING" ? "leave_request.create" : "leave_request.approve",
    targetBusinessUnitId: row.businessUnitId,
    targetUserId: auth.userId,
  });
  if (!canDelete.allowed || (row.membershipId !== auth.membership.id && !canDelete.reasons.includes("SCOPE_ALL_OK"))) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });
  }

  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending leave requests can be withdrawn." }, { status: 400 });
  }

  if (row.status === "PENDING" && row.membershipId === auth.membership.id) {
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: "CANCELED", rejectReason: "withdrawn by requester" },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.leave-requests",
      action: "leave_request.cancel",
      targetType: "leave_request",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, id });
  }

  await prisma.leaveRequest.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.leave-requests",
    action: "leave_request.delete",
    targetType: "leave_request",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
  });
  return NextResponse.json({ ok: true, deleted: id });
}
