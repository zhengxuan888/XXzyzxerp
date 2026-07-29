import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, businessUnitId: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const canCreate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "sku.create",
    targetBusinessUnitId: product.businessUnitId,
  });
  if (!canCreate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canCreate.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json({ error: "sku code is required." }, { status: 400 });
  }
  const code = body.code.trim();
  if (await prisma.productSku.findUnique({ where: { productId_code: { productId: id, code } }, select: { id: true } })) {
    return NextResponse.json({ error: "SKU 编码已存在。" }, { status: 409 });
  }

  const row = await prisma.productSku.create({
    data: {
      productId: id,
      code,
      barcode: typeof body.barcode === "string" ? body.barcode : null,
      attributes: typeof body.attributes === "object" && body.attributes !== null ? body.attributes : null,
      isActive: body.isActive !== false,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.products",
    action: "sku.create",
    targetType: "product_sku",
    targetId: row.id,
    businessUnitId: product.businessUnitId,
    roleId: auth.membership.roleId,
  });

  return NextResponse.json(row);
}
