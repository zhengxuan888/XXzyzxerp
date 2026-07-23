import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "product.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });

  const canSeeAll = canRead.reasons.includes("SCOPE_ALL") || canRead.reasons.includes("SCOPE_ALL_OK");
  const rows = await prisma.product.findMany({
    where: canSeeAll ? { isActive: true } : { isActive: true, businessUnitId: auth.membership.businessUnitId },
    include: { legalEntity: { select: { code: true, name: true } }, skus: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const targetBusinessUnitId = auth.membership.businessUnitId;
  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "product.create",
    targetBusinessUnitId,
  });
  if (!canCreate.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.code !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  type SkuInput = { code?: unknown; barcode?: unknown };
  const skusInput = Array.isArray(body.skus) ? (body.skus as SkuInput[]) : [];
  const product = await prisma.product.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: targetBusinessUnitId,
      code: String(body.code).trim(),
      name: String(body.name).trim(),
      description: typeof body.description === "string" ? body.description : null,
      category: typeof body.category === "string" ? body.category : null,
      unit: typeof body.unit === "string" ? body.unit : null,
      isActive: body.isActive !== false,
      skus: {
        create: skusInput
          .filter((sku): sku is SkuInput => sku !== null && typeof sku === "object")
          .map((sku: SkuInput) => ({
            code: String((sku.code as unknown) || ""),
            barcode: typeof sku.barcode === "string" ? sku.barcode : null,
            attributes: undefined,
            isActive: true,
          }))
          .filter((sku: { code: string }) => sku.code.trim().length > 0),
      },
    },
    include: { skus: true },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.products",
    action: "product.create",
    targetType: "product",
    targetId: product.id,
    businessUnitId: targetBusinessUnitId,
    roleId: auth.membership.roleId,
    details: { code: product.code, name: product.name },
  });

  return NextResponse.json(product);
}
