import { NextRequest } from "next/server";

import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "Unauthenticated.", 401);

  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "inventory.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!decision.allowed) return fail("FORBIDDEN", "Inventory read denied.", 403, decision.reasons);

  const pagination = parsePagination(request);
  const where = { businessUnitId: auth.membership.businessUnitId };
  const [items, total] = await prisma.$transaction([
    prisma.inventoryBalance.findMany({
      where,
      include: { site: { select: { code: true, name: true } }, sku: { include: { product: { select: { code: true, name: true } } } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.inventoryBalance.count({ where }),
  ]);
  return paginated(items, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "Unauthenticated.", 401);
  const body = await request.json().catch(() => null);
  const quantityDelta = Number(body?.quantityDelta);
  const siteId = typeof body?.siteId === "string" ? body.siteId : "";
  const skuId = typeof body?.skuId === "string" ? body.skuId : "";
  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : request.headers.get("idempotency-key")?.trim();

  if (!siteId || !skuId || !idempotencyKey || !Number.isSafeInteger(quantityDelta) || quantityDelta === 0) {
    return fail("VALIDATION_ERROR", "siteId, skuId, non-zero safe integer quantityDelta, and idempotencyKey are required.", 400);
  }

  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "inventory.adjust",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetSiteId: siteId,
  });
  if (!decision.allowed) return fail("FORBIDDEN", "Inventory adjustment denied.", 403, decision.reasons);

  const [site, sku] = await Promise.all([
    prisma.site.findFirst({ where: { id: siteId, businessUnitId: auth.membership.businessUnitId, isActive: true } }),
    prisma.productSku.findFirst({
      where: { id: skuId, isActive: true, product: { businessUnitId: auth.membership.businessUnitId, isActive: true } },
    }),
  ]);
  if (!site || !sku) return fail("OWNERSHIP_MISMATCH", "Site or SKU is outside the current business unit.", 400);

  const existing = await prisma.inventoryTransaction.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId: auth.membership.businessUnitId, idempotencyKey } },
  });
  if (existing) return ok(existing);

  const result = await prisma.$transaction(
    async (tx) => {
      if (quantityDelta > 0) {
        await tx.inventoryBalance.upsert({
          where: {
            businessUnitId_siteId_skuId: { businessUnitId: auth.membership.businessUnitId, siteId, skuId },
          },
          update: { onHandQuantity: { increment: quantityDelta }, version: { increment: 1 } },
          create: { businessUnitId: auth.membership.businessUnitId, siteId, skuId, onHandQuantity: quantityDelta },
        });
      } else {
        const changed = await tx.inventoryBalance.updateMany({
          where: {
            businessUnitId: auth.membership.businessUnitId,
            siteId,
            skuId,
            onHandQuantity: { gte: Math.abs(quantityDelta) },
          },
          data: { onHandQuantity: { increment: quantityDelta }, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new Error("INSUFFICIENT_STOCK");
      }
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: {
          businessUnitId_siteId_skuId: { businessUnitId: auth.membership.businessUnitId, siteId, skuId },
        },
      });
      return tx.inventoryTransaction.create({
        data: {
          businessUnitId: auth.membership.businessUnitId,
          siteId,
          skuId,
          actorUserId: auth.userId,
          actorMembershipId: auth.membership.id,
          type: "ADJUSTMENT",
          quantityDelta,
          onHandAfter: balance.onHandQuantity,
          reservedAfter: balance.reservedQuantity,
          idempotencyKey,
          reason: typeof body?.reason === "string" ? body.reason : null,
        },
      });
    },
    { isolationLevel: "Serializable" },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return null;
    throw error;
  });
  if (!result) return fail("INSUFFICIENT_STOCK", "Adjustment would create negative stock.", 409);

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.inventory",
    action: "inventory.adjust",
    targetType: "inventory_transaction",
    targetId: result.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { skuId, siteId, quantityDelta, idempotencyKey },
  });
  return ok(result, { status: 201 });
}
