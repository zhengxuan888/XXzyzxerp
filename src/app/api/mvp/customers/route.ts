import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { paginated, parsePagination } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "customer.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
  }

  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const where = {
    isActive: true,
    businessUnitId: auth.membership.businessUnitId,
    ...(query
      ? { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: { legalEntity: { select: { code: true, name: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const targetBusinessUnitId = auth.membership.businessUnitId;
  const canWrite = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "customer.create",
    targetBusinessUnitId,
  });
  if (!canWrite.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canWrite.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.code !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  const unit = await prisma.businessUnit.findUnique({ where: { id: targetBusinessUnitId } });
  if (!unit) {
    return NextResponse.json({ error: "Invalid business unit." }, { status: 400 });
  }

  const row = await prisma.customer.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: targetBusinessUnitId,
      code: String(body.code).trim(),
      name: String(body.name).trim(),
      contactName: typeof body.contactName === "string" ? body.contactName : null,
      contactPhone: typeof body.contactPhone === "string" ? body.contactPhone : null,
      contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : null,
      taxId: typeof body.taxId === "string" ? body.taxId : null,
      address: typeof body.address === "string" ? body.address : null,
      isActive: body.isActive !== false,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.customers",
    action: "customer.create",
    targetType: "customer",
    targetId: row.id,
    businessUnitId: targetBusinessUnitId,
    roleId: auth.membership.roleId,
    details: { operation: "create", code: row.code, name: row.name },
  });

  return NextResponse.json(row);
}
