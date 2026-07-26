ALTER TABLE "Order" ADD COLUMN "shopId" TEXT;

CREATE INDEX "Order_businessUnitId_shopId_idx" ON "Order"("businessUnitId", "shopId");
