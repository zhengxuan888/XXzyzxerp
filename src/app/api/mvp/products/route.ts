import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { paginated, parsePagination } from "@/lib/api-response";

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
    prisma.product.findMany({
      where,
      include: { legalEntity: { select: { code: true, name: true } }, skus: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.product.count({ where }),
  ]);
  return paginated(rows, total, pagination);
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

  const code = body.code.trim();
  const name = body.name.trim();
  if (!code || !name) {
    return NextResponse.json({ error: "商品编码和商品名称不能为空。" }, { status: 400 });
  }
  const duplicateProduct = await prisma.product.findFirst({
    where: { businessUnitId: targetBusinessUnitId, code },
    select: { id: true },
  });
  if (duplicateProduct) {
    return NextResponse.json({ error: "当前业务板块已存在相同商品编码。" }, { status: 409 });
  }

  type SkuInput = { code?: unknown; barcode?: unknown };
  const skusInput = Array.isArray(body.skus) ? (body.skus as SkuInput[]) : [];
  const skuCodes = skusInput
    .filter((sku): sku is SkuInput => sku !== null && typeof sku === "object")
    .map((sku) => String(sku.code || "").trim())
    .filter(Boolean);
  if (new Set(skuCodes).size !== skuCodes.length) {
    return NextResponse.json({ error: "同一商品内不能填写重复的 SKU 编码。" }, { status: 409 });
  }

  const product = await prisma.product.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: targetBusinessUnitId,
      code,
      name,
      description: typeof body.description === "string" ? body.description : null,
      category: typeof body.category === "string" ? body.category : null,
      unit: typeof body.unit === "string" ? body.unit : null,
      isActive: body.isActive !== false,
      skus: {
        create: skusInput
          .filter((sku): sku is SkuInput => sku !== null && typeof sku === "object")
          .map((sku: SkuInput) => ({
            code: String((sku.code as unknown) || "").trim(),
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
