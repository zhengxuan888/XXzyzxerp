-- Safety stock is a configurable SKU fact. It is intentionally data-driven,
-- rather than a country, warehouse, or product-name rule in application code.
ALTER TABLE "ProductSku"
  ADD COLUMN "safetyStockQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProductSku"
  ADD CONSTRAINT "ProductSku_safetyStockQuantity_nonnegative_check"
  CHECK ("safetyStockQuantity" >= 0);
