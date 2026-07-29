ALTER TABLE "Order"
  ADD COLUMN "reviewClaimedByMembershipId" TEXT,
  ADD COLUMN "reviewClaimedAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_reviewClaimedByMembershipId_fkey"
  FOREIGN KEY ("reviewClaimedByMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_businessUnitId_status_reviewClaimedByMembershipId_idx"
  ON "Order"("businessUnitId", "status", "reviewClaimedByMembershipId");
