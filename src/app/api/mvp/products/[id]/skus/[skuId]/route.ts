import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string; skuId: string }> };

export async function PATCH(request: NextRequest, { params }: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id, skuId } = await params;
  const current = await prisma.productSku.findFirst({ where: { id: skuId, productId: id }, include: { product: true } });
  if (!current) return NextResponse.json({ error: "SKU_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "sku.update", targetBusinessUnitId: current.product.businessUnitId });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: permission.reasons }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.code !== "string" || !body.code.trim()) return NextResponse.json({ error: "SKU 编码不能为空。" }, { status: 400 });
  const code = body.code.trim();
  if (await prisma.productSku.findFirst({ where: { productId: id, code, id: { not: skuId } }, select: { id: true } })) return NextResponse.json({ error: "SKU 编码已存在。" }, { status: 409 });
  const row = await prisma.productSku.update({ where: { id: skuId }, data: { code, barcode: typeof body.barcode === "string" && body.barcode.trim() ? body.barcode.trim() : null, isActive: body.isActive === true } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.products", action: "sku.update", targetType: "product_sku", targetId: row.id, businessUnitId: current.product.businessUnitId, roleId: auth.membership.roleId, details: { previous: current, next: row } });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id, skuId } = await params;
  const current = await prisma.productSku.findFirst({ where: { id: skuId, productId: id }, include: { product: true } });
  if (!current) return NextResponse.json({ error: "SKU_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "sku.update", targetBusinessUnitId: current.product.businessUnitId });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const row = await prisma.productSku.update({ where: { id: skuId }, data: { isActive: false } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.products", action: "sku.deactivate", targetType: "product_sku", targetId: row.id, businessUnitId: current.product.businessUnitId, roleId: auth.membership.roleId });
  return NextResponse.json({ ok: true, deactivated: row.id });
}
