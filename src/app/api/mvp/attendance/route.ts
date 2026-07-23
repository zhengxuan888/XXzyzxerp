import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { AttendanceType } from "@prisma/client";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

function parseAttendanceType(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "CHECK_IN" || normalized === "CHECK_OUT") return normalized as AttendanceType;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canApprove = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attendance.approve",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  const canReadSelf = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attendance.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetUserId: auth.userId,
  });
  if (!canApprove.allowed && !canReadSelf.allowed) {
    return NextResponse.json(
      { error: "FORBIDDEN", reasons: [...canReadSelf.reasons, ...canApprove.reasons] },
      { status: 403 },
    );
  }

  const canReadAll =
    canApprove.reasons.includes("SCOPE_ALL") ||
    canApprove.reasons.includes("SCOPE_ALL_OK") ||
    canApprove.reasons.includes("SCOPE_BUSINESS_UNIT_OK");
  const rows = await prisma.attendance.findMany({
    where: canReadAll ? { businessUnitId: auth.membership.businessUnitId } : { userId: auth.userId },
    include: {
      user: { select: { username: true, fullName: true } },
      membership: { select: { id: true, departmentId: true } },
    },
    orderBy: { attendanceDate: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.attendanceDate !== "string") {
    return NextResponse.json({ error: "attendanceDate is required." }, { status: 400 });
  }

  const recordType = parseAttendanceType(body.recordType);
  if (!recordType) {
    return NextResponse.json({ error: "recordType must be CHECK_IN or CHECK_OUT." }, { status: 400 });
  }

  const occurred = new Date(body.attendanceDate);
  if (Number.isNaN(occurred.getTime())) {
    return NextResponse.json({ error: "attendanceDate invalid." }, { status: 400 });
  }

  const canWrite = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attendance.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetUserId: auth.userId,
  });
  if (!canWrite.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canWrite.reasons }, { status: 403 });
  }

  try {
    const row = await prisma.attendance.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        userId: auth.userId,
        membershipId: auth.membership.id,
        siteId: auth.membership.siteId,
        attendanceDate: new Date(occurred.toDateString()),
        recordType,
        locationCode: typeof body.locationCode === "string" ? body.locationCode : null,
        memo: typeof body.memo === "string" ? body.memo : null,
      },
      include: { user: { select: { username: true } } },
    });

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "mvp.attendance",
      action: "attendance.create",
      targetType: "attendance",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { date: row.attendanceDate.toISOString(), type: row.recordType },
    });

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error && /Unique constraint/.test(error.message)) {
      return NextResponse.json({ error: "Attendance record already exists for this user, date and type." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const row = await prisma.attendance.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Attendance not found." }, { status: 404 });

  const canDelete = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "attendance.delete",
    targetBusinessUnitId: row.businessUnitId,
    targetUserId: row.userId,
  });
  if (!canDelete.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canDelete.reasons }, { status: 403 });

  await prisma.attendance.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.attendance",
    action: "attendance.delete",
    targetType: "attendance",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
  });

  return NextResponse.json({ ok: true, deleted: id });
}
