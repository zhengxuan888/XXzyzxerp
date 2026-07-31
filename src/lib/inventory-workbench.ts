export type InventoryStockStatus = "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";

export type InventoryWorkbenchBalance = {
  id: string;
  skuId: string;
  onHandQuantity: number;
  reservedQuantity: number;
  updatedAt: Date;
  sku: {
    code: string;
    barcode: string | null;
    safetyStockQuantity: number;
    product: { code: string; name: string };
  };
};

export type InventoryWorkbenchRow<T extends InventoryWorkbenchBalance = InventoryWorkbenchBalance> = T & {
  availableQuantity: number;
  skuAvailableQuantity: number;
  stockStatus: InventoryStockStatus;
};

export type InventoryStockFilter = "ALL" | InventoryStockStatus;
export type InventorySort = "UPDATED_DESC" | "AVAILABLE_ASC" | "AVAILABLE_DESC" | "SKU_ASC";

export function inventoryAvailableQuantity(row: Pick<InventoryWorkbenchBalance, "onHandQuantity" | "reservedQuantity">) {
  return row.onHandQuantity - row.reservedQuantity;
}

function statusFor(availableQuantity: number, safetyStockQuantity: number): InventoryStockStatus {
  if (availableQuantity <= 0) return "OUT_OF_STOCK";
  if (safetyStockQuantity > 0 && availableQuantity <= safetyStockQuantity) return "LOW_STOCK";
  return "NORMAL";
}

/**
 * Safety stock belongs to the SKU master record. A SKU can have multiple
 * site balances, so its alert state is calculated from the total available
 * stock across the current business-unit result set rather than one arbitrary
 * warehouse row.
 */
export function enrichInventoryRows<T extends InventoryWorkbenchBalance>(rows: T[]): InventoryWorkbenchRow<T>[] {
  const availableBySku = new Map<string, number>();
  rows.forEach((row) => {
    availableBySku.set(row.skuId, (availableBySku.get(row.skuId) ?? 0) + inventoryAvailableQuantity(row));
  });
  return rows.map((row) => {
    const skuAvailableQuantity = availableBySku.get(row.skuId) ?? 0;
    return {
      ...row,
      availableQuantity: inventoryAvailableQuantity(row),
      skuAvailableQuantity,
      stockStatus: statusFor(skuAvailableQuantity, row.sku.safetyStockQuantity),
    };
  });
}

export function filterInventoryRows<T extends InventoryWorkbenchBalance>(
  rows: InventoryWorkbenchRow<T>[],
  filter: InventoryStockFilter,
) {
  return filter === "ALL" ? rows : rows.filter((row) => row.stockStatus === filter);
}

export function sortInventoryRows<T extends InventoryWorkbenchBalance>(
  rows: InventoryWorkbenchRow<T>[],
  sort: InventorySort,
) {
  return [...rows].sort((left, right) => {
    if (sort === "AVAILABLE_ASC") return left.skuAvailableQuantity - right.skuAvailableQuantity || left.id.localeCompare(right.id);
    if (sort === "AVAILABLE_DESC") return right.skuAvailableQuantity - left.skuAvailableQuantity || left.id.localeCompare(right.id);
    if (sort === "SKU_ASC") {
      return left.sku.code.localeCompare(right.sku.code) || left.sku.product.code.localeCompare(right.sku.product.code) || left.id.localeCompare(right.id);
    }
    return right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id);
  });
}

export function summarizeInventoryRows<T extends InventoryWorkbenchBalance>(rows: InventoryWorkbenchRow<T>[]) {
  const skuStates = new Map<string, InventoryStockStatus>();
  rows.forEach((row) => skuStates.set(row.skuId, row.stockStatus));
  return {
    balanceCount: rows.length,
    skuCount: skuStates.size,
    onHandQuantity: rows.reduce((total, row) => total + row.onHandQuantity, 0),
    reservedQuantity: rows.reduce((total, row) => total + row.reservedQuantity, 0),
    availableQuantity: rows.reduce((total, row) => total + row.availableQuantity, 0),
    normalSkuCount: [...skuStates.values()].filter((status) => status === "NORMAL").length,
    lowStockSkuCount: [...skuStates.values()].filter((status) => status === "LOW_STOCK").length,
    outOfStockSkuCount: [...skuStates.values()].filter((status) => status === "OUT_OF_STOCK").length,
  };
}
