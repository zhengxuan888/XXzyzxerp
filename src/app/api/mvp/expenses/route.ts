import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "expense.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  const canSeeAll = canRead.reasons.includes("SCOPE_ALL") || canRead.reasons.includes("SCOPE_ALL_OK");
  const rows = await prisma.expense.findMany({
    where: canSeeAll ? {} : { businessUnitId: auth.membership.businessUnitId },
    include: { actorUser: { select: { username: true } }, order: { select: { orderNo: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "expense.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canCreate.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.category !== "string" || typeof body.amountCents !== "number") {
    return NextResponse.json({ error: "category and amountCents are required." }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  if (orderId) {
    const order = await prisma.order.findFirst({ where: { id: orderId, businessUnitId: auth.membership.businessUnitId }, select: { id: true } });
    if (!order) return NextResponse.json({ error: "Order mismatch for current business unit." }, { status: 400 });
  }

  const row = await prisma.expense.create({
    data: {
      orderId,
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      siteId: auth.membership.siteId,
      actorUserId: auth.userId,
      category: String(body.category),
      amountCents: Math.max(0, Math.floor(body.amountCents)),
      paidAt: typeof body.paidAt === "string" ? new Date(body.paidAt) : null,
      currency: typeof body.currency === "string" ? body.currency : "CNY",
      note: typeof body.note === "string" ? body.note : null,
    },
    include: { order: { select: { orderNo: true } } },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.expenses",
    action: "expense.create",
    targetType: "expense",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { category: row.category, amount: row.amountCents },
  });

  return NextResponse.json(row);
}
