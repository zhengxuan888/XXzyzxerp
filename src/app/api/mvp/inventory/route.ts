import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  enrichInventoryRows,
  filterInventoryRows,
  sortInventoryRows,
  type InventorySort,
  type InventoryStockFilter,
} from "@/lib/inventory-workbench";

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
  const query = request.nextUrl.searchParams;
  const keyword = query.get("q")?.trim().slice(0, 120) ?? "";
  const siteId = query.get("siteId")?.trim() ?? "";
  const requestedStock = query.get("stock") as InventoryStockFilter | null;
  const stock: InventoryStockFilter = ["ALL", "NORMAL", "LOW_STOCK", "OUT_OF_STOCK"].includes(requestedStock ?? "")
    ? requestedStock as InventoryStockFilter
    : "ALL";
  const requestedSort = query.get("sort") as InventorySort | null;
  const sort: InventorySort = ["UPDATED_DESC", "AVAILABLE_ASC", "AVAILABLE_DESC", "SKU_ASC"].includes(requestedSort ?? "")
    ? requestedSort as InventorySort
    : "UPDATED_DESC";
  const where: Prisma.InventoryBalanceWhereInput = {
    businessUnitId: auth.membership.businessUnitId,
    ...(siteId ? { siteId } : {}),
    ...(keyword ? {
      OR: [
        { sku: { is: { code: { contains: keyword, mode: "insensitive" } } } },
        { sku: { is: { barcode: { contains: keyword, mode: "insensitive" } } } },
        { sku: { is: { product: { is: { code: { contains: keyword, mode: "insensitive" } } } } } },
        { sku: { is: { product: { is: { name: { contains: keyword, mode: "insensitive" } } } } } },
        { site: { is: { code: { contains: keyword, mode: "insensitive" } } } },
        { site: { is: { name: { contains: keyword, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const candidates = await prisma.inventoryBalance.findMany({
    where,
    include: {
      site: { select: { id: true, code: true, name: true } },
      sku: { include: { product: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const items = sortInventoryRows(filterInventoryRows(enrichInventoryRows(candidates), stock), sort);
  const total = items.length;
  return paginated(items.slice(pagination.skip, pagination.skip + pagination.take), total, pagination);
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

  let result: Awaited<ReturnType<typeof prisma.inventoryTransaction.create>> | null = null;
  let replayed = false;
  let concurrencyConflict = false;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const outcome = await prisma.$transaction(
        async (tx) => {
          const transactionAlreadyCreated = await tx.inventoryTransaction.findUnique({
            where: {
              businessUnitId_idempotencyKey: {
                businessUnitId: auth.membership.businessUnitId,
                idempotencyKey,
              },
            },
          });
          if (transactionAlreadyCreated) {
            return { record: transactionAlreadyCreated, replayed: true };
          }

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
          const record = await tx.inventoryTransaction.create({
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
          return { record, replayed: false };
        },
        { isolationLevel: "Serializable" },
      );
      result = outcome.record;
      replayed = outcome.replayed;
      break;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        return fail("INSUFFICIENT_STOCK", "Adjustment would create negative stock.", 409);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result = await prisma.inventoryTransaction.findUnique({
          where: {
            businessUnitId_idempotencyKey: {
              businessUnitId: auth.membership.businessUnitId,
              idempotencyKey,
            },
          },
        });
        if (result) {
          replayed = true;
          break;
        }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        concurrencyConflict = true;
        if (attempt < 3) continue;
        break;
      }
      throw error;
    }
  }

  if (!result && concurrencyConflict) {
    return fail("INVENTORY_CONCURRENTLY_CHANGED", "Inventory changed concurrently. Please retry.", 409);
  }
  if (!result) return fail("INVENTORY_ADJUSTMENT_FAILED", "Inventory adjustment failed.", 409);
  if (replayed) return ok(result);

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
