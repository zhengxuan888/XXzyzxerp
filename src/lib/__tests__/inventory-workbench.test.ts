import { describe, expect, it } from "vitest";

import {
  enrichInventoryRows,
  filterInventoryRows,
  inventoryAvailableQuantity,
  sortInventoryRows,
  summarizeInventoryRows,
} from "@/lib/inventory-workbench";

const rows = [
  {
    id: "a", skuId: "sku-a", onHandQuantity: 8, reservedQuantity: 3, updatedAt: new Date("2026-08-01T10:00:00Z"),
    sku: { code: "SKU-A", barcode: null, safetyStockQuantity: 6, product: { code: "P-A", name: "A" } },
  },
  {
    id: "b", skuId: "sku-a", onHandQuantity: 4, reservedQuantity: 0, updatedAt: new Date("2026-08-01T11:00:00Z"),
    sku: { code: "SKU-A", barcode: null, safetyStockQuantity: 6, product: { code: "P-A", name: "A" } },
  },
  {
    id: "c", skuId: "sku-b", onHandQuantity: 2, reservedQuantity: 2, updatedAt: new Date("2026-08-01T09:00:00Z"),
    sku: { code: "SKU-B", barcode: null, safetyStockQuantity: 1, product: { code: "P-B", name: "B" } },
  },
];

describe("inventory workbench", () => {
  it("calculates available stock without hiding a reservation mismatch", () => {
    expect(inventoryAvailableQuantity({ onHandQuantity: 2, reservedQuantity: 3 })).toBe(-1);
  });

  it("uses the SKU total across sites for a configurable safety-stock alert", () => {
    const enriched = enrichInventoryRows(rows);
    expect(enriched.find((row) => row.id === "a")).toMatchObject({ availableQuantity: 5, skuAvailableQuantity: 9, stockStatus: "NORMAL" });
    expect(enriched.find((row) => row.id === "c")).toMatchObject({ availableQuantity: 0, skuAvailableQuantity: 0, stockStatus: "OUT_OF_STOCK" });
  });

  it("filters, sorts and counts distinct SKU alert states predictably", () => {
    const enriched = enrichInventoryRows(rows);
    expect(filterInventoryRows(enriched, "OUT_OF_STOCK").map((row) => row.id)).toEqual(["c"]);
    expect(sortInventoryRows(enriched, "AVAILABLE_ASC").map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(summarizeInventoryRows(enriched)).toMatchObject({ skuCount: 2, onHandQuantity: 14, reservedQuantity: 5, availableQuantity: 9, normalSkuCount: 1, outOfStockSkuCount: 1 });
  });
});
