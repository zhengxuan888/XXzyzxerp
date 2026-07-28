import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { managerMembershipId?: string | null } | null;
  if (!body || (body.managerMembershipId !== null && body.managerMembershipId !== undefined && typeof body.managerMembershipId !== "string")) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const target = await prisma.membership.findFirst({ where: { id, isActive: true } });
  if (!target) return NextResponse.json({ error: "MEMBERSHIP_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "membership.reporting_line.manage",
    targetBusinessUnitId: target.businessUnitId,
    targetDepartmentId: target.departmentId,
    targetSiteId: target.siteId,
    targetUserId: target.userId,
  });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: permission.reasons }, { status: 403 });

  const managerId = body.managerMembershipId || null;
  if (managerId === target.id) return NextResponse.json({ error: "REPORTING_LINE_SELF_REFERENCE" }, { status: 409 });
  if (managerId) {
    const manager = await prisma.membership.findFirst({
      where: { id: managerId, businessUnitId: target.businessUnitId, isActive: true },
      select: { id: true, managerMembershipId: true },
    });
    if (!manager) return NextResponse.json({ error: "MANAGER_OUT_OF_SCOPE" }, { status: 400 });

    const memberships = await prisma.membership.findMany({
      where: { businessUnitId: target.businessUnitId, isActive: true },
      select: { id: true, managerMembershipId: true },
    });
    const parentById = new Map(memberships.map((row) => [row.id, row.managerMembershipId]));
    let cursor: string | null = manager.id;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === target.id) return NextResponse.json({ error: "REPORTING_LINE_CYCLE" }, { status: 409 });
      if (visited.has(cursor)) return NextResponse.json({ error: "REPORTING_LINE_EXISTING_CYCLE" }, { status: 409 });
      visited.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const previousManagerMembershipId = target.managerMembershipId;
  const updated = await prisma.membership.update({ where: { id: target.id }, data: { managerMembershipId: managerId } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "admin.memberships",
    action: "membership.reporting_line.update",
    targetType: "membership",
    targetId: target.id,
    businessUnitId: target.businessUnitId,
    roleId: auth.membership.roleId,
    details: { previousManagerMembershipId, managerMembershipId: managerId },
  });
  return NextResponse.json({ id: updated.id, managerMembershipId: updated.managerMembershipId });
}
