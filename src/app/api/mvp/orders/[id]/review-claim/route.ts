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
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "claim" && body?.action !== "release") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });

  const order = await prisma.order.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.review",
    targetBusinessUnitId: order.businessUnitId,
    targetDepartmentId: order.departmentId,
    targetSiteId: order.siteId,
  });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (order.status !== "SUBMITTED") return NextResponse.json({ error: "ORDER_NOT_REVIEWABLE" }, { status: 409 });

  if (body.action === "claim") {
    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: "SUBMITTED", OR: [{ reviewClaimedByMembershipId: null }, { reviewClaimedByMembershipId: auth.membership.id }] },
      data: { reviewClaimedByMembershipId: auth.membership.id, reviewClaimedAt: new Date() },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "ORDER_ALREADY_CLAIMED" }, { status: 409 });
  } else {
    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: "SUBMITTED", reviewClaimedByMembershipId: auth.membership.id },
      data: { reviewClaimedByMembershipId: null, reviewClaimedAt: null },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "NOT_CLAIM_OWNER" }, { status: 409 });
  }

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "sales.order_review",
    action: `order.review.${body.action}`,
    targetType: "order",
    targetId: order.id,
    businessUnitId: order.businessUnitId,
    roleId: auth.membership.roleId,
    details: { claimedByMembershipId: body.action === "claim" ? auth.membership.id : null },
  });
  return NextResponse.json({ ok: true });
}
