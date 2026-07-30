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
    actionKey: "announcement.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  const canSeeAll =
    canRead.reasons.includes("SCOPE_ALL") ||
    canRead.reasons.includes("SCOPE_ALL_OK") ||
    canRead.reasons.includes("SCOPE_BUSINESS_UNIT_OK");
  const pagination = parsePagination(request);
  const where = canSeeAll
    ? { businessUnitId: auth.membership.businessUnitId }
    : { isActive: true, businessUnitId: auth.membership.businessUnitId };
  const [rows, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { site: { select: { code: true, name: true } } },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.announcement.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "announcement.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canCreate.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || typeof body.content !== "string") {
    return NextResponse.json({ error: "title and content are required." }, { status: 400 });
  }

  const row = await prisma.announcement.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      siteId: typeof body.siteId === "string" ? body.siteId : null,
      title: body.title,
      content: body.content,
      isActive: body.isActive !== false,
      publishedAt: typeof body.publishedAt === "string" ? new Date(body.publishedAt) : null,
      expiredAt: typeof body.expiredAt === "string" ? new Date(body.expiredAt) : null,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.announcements",
    action: "announcement.create",
    targetType: "announcement",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { title: row.title },
  });

  return NextResponse.json(row);
}
