import type { Prisma } from "@prisma/client";

export class InventoryError extends Error {
  constructor(
    public readonly code:
      | "SKU_REQUIRED"
      | "SITE_REQUIRED"
      | "BALANCE_MISSING"
      | "INSUFFICIENT_STOCK"
      | "RESERVATION_MISSING"
      | "RESERVATION_STATE_INVALID",
    message: string,
  ) {
    super(message);
  }
}

type Actor = {
  userId: string;
  membershipId: string;
  businessUnitId: string;
  siteId: string;
};

type OrderStockItem = { skuId: string | null; quantity: number; stockControlled?: boolean };

export function consolidateSkuQuantities(items: OrderStockItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    // A hand-entered ecommerce item is explicitly marked non-stock-controlled
    // at creation time. It is not a missing SKU and must never cause a silent
    // inventory deduction. Existing/catalog items default to stock control.
    if (item.stockControlled === false) continue;
    if (!item.skuId) throw new InventoryError("SKU_REQUIRED", "Every stock-controlled order item requires a SKU.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new InventoryError("SKU_REQUIRED", "Inventory quantity must be a positive safe integer.");
    }
    quantities.set(item.skuId, (quantities.get(item.skuId) ?? 0) + item.quantity);
  }
  return [...quantities.entries()].map(([skuId, quantity]) => ({ skuId, quantity }));
}

export async function reserveOrderInventory(
  tx: Prisma.TransactionClient,
  actor: Actor,
  order: { id: string; businessUnitId: string; items: OrderStockItem[] },
) {
  const requested = consolidateSkuQuantities(order.items);
  for (const item of requested) {
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        businessUnitId: order.businessUnitId,
        siteId: actor.siteId,
        skuId: item.skuId,
        onHandQuantity: { gte: item.quantity },
      },
      data: {
        reservedQuantity: { increment: item.quantity },
        onHandQuantity: { decrement: item.quantity },
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      const exists = await tx.inventoryBalance.findUnique({
        where: {
          businessUnitId_siteId_skuId: {
            businessUnitId: order.businessUnitId,
            siteId: actor.siteId,
            skuId: item.skuId,
          },
        },
      });
      throw new InventoryError(
        exists ? "INSUFFICIENT_STOCK" : "BALANCE_MISSING",
        exists ? `Insufficient stock for SKU ${item.skuId}.` : `Inventory balance missing for SKU ${item.skuId}.`,
      );
    }
    const balance = await tx.inventoryBalance.findUniqueOrThrow({
      where: {
        businessUnitId_siteId_skuId: {
          businessUnitId: order.businessUnitId,
          siteId: actor.siteId,
          skuId: item.skuId,
        },
      },
    });
    await tx.inventoryReservation.create({
      data: {
        businessUnitId: order.businessUnitId,
        siteId: actor.siteId,
        skuId: item.skuId,
        orderId: order.id,
        quantity: item.quantity,
      },
    });
    await tx.inventoryTransaction.create({
      data: {
        businessUnitId: order.businessUnitId,
        siteId: actor.siteId,
        skuId: item.skuId,
        orderId: order.id,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        type: "RESERVE",
        quantityDelta: -item.quantity,
        onHandAfter: balance.onHandQuantity,
        reservedAfter: balance.reservedQuantity,
        idempotencyKey: `order:${order.id}:reserve:${item.skuId}`,
      },
    });
  }
}

export async function finalizeOrderInventory(
  tx: Prisma.TransactionClient,
  actor: Actor,
  orderId: string,
  mode: "SHIP" | "RELEASE",
) {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: "ACTIVE", businessUnitId: actor.businessUnitId },
  });
  if (reservations.length === 0) {
    throw new InventoryError("RESERVATION_MISSING", "No active inventory reservation exists for this order.");
  }
  for (const reservation of reservations) {
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        businessUnitId: reservation.businessUnitId,
        siteId: reservation.siteId,
        skuId: reservation.skuId,
        reservedQuantity: { gte: reservation.quantity },
      },
      data:
        mode === "RELEASE"
          ? {
              reservedQuantity: { decrement: reservation.quantity },
              onHandQuantity: { increment: reservation.quantity },
              version: { increment: 1 },
            }
          : { reservedQuantity: { decrement: reservation.quantity }, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new InventoryError("RESERVATION_STATE_INVALID", "Inventory reservation and balance are inconsistent.");
    }
    const balance = await tx.inventoryBalance.findUniqueOrThrow({
      where: {
        businessUnitId_siteId_skuId: {
          businessUnitId: reservation.businessUnitId,
          siteId: reservation.siteId,
          skuId: reservation.skuId,
        },
      },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: mode === "SHIP" ? "CONSUMED" : "RELEASED" },
    });
    await tx.inventoryTransaction.create({
      data: {
        businessUnitId: reservation.businessUnitId,
        siteId: reservation.siteId,
        skuId: reservation.skuId,
        orderId,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        type: mode,
        quantityDelta: mode === "RELEASE" ? reservation.quantity : 0,
        onHandAfter: balance.onHandQuantity,
        reservedAfter: balance.reservedQuantity,
        idempotencyKey: `order:${orderId}:${mode.toLowerCase()}:${reservation.skuId}`,
      },
    });
  }
}
