ALTER TABLE "Order"
  ADD COLUMN "shopWindowTransferredAt" TIMESTAMP(3),
  ADD COLUMN "shopWindowTransferredByMembershipId" TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_shopWindowTransferredByMembershipId_fkey"
  FOREIGN KEY ("shopWindowTransferredByMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_businessUnitId_shopWindowTransferredAt_idx"
  ON "Order"("businessUnitId", "shopWindowTransferredAt");
