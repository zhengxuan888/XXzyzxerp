-- A manually entered ecommerce product is an explicit non-stock-controlled
-- order item. Existing items retain the safe default (stock controlled).
ALTER TABLE "OrderItem"
  ADD COLUMN "stockControlled" BOOLEAN NOT NULL DEFAULT true;

-- Keep the catalog relation when available, but allow an approved template to
-- record a hand-entered product name without inventing a product/SKU or
-- silently affecting inventory.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
