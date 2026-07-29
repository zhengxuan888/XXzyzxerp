import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "product.update", targetBusinessUnitId: current.businessUnitId });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: permission.reasons }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.code !== "string" || typeof body.name !== "string") return NextResponse.json({ error: "商品编码和名称为必填项。" }, { status: 400 });
  const code = body.code.trim();
  const name = body.name.trim();
  if (!code || !name) return NextResponse.json({ error: "商品编码和名称不能为空。" }, { status: 400 });
  if (await prisma.product.findFirst({ where: { businessUnitId: current.businessUnitId, code, id: { not: current.id } }, select: { id: true } })) return NextResponse.json({ error: "商品编码已存在。" }, { status: 409 });
  const row = await prisma.product.update({ where: { id }, data: { code, name, description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null, category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : null, unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null, isActive: body.isActive === true } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.products", action: "product.update", targetType: "product", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId, details: { previous: current, next: row } });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "product.delete", targetBusinessUnitId: current.businessUnitId });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: permission.reasons }, { status: 403 });
  const row = await prisma.product.update({ where: { id }, data: { isActive: false } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.products", action: "product.deactivate", targetType: "product", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId });
  return NextResponse.json({ ok: true, deactivated: row.id });
}
