ALTER TABLE "Order"
ADD COLUMN "recipientEmail" TEXT,
ADD COLUMN "emailValidationStatus" TEXT,
ADD COLUMN "emailValidatedAt" TIMESTAMP(3);

CREATE INDEX "Order_businessUnitId_recipientEmail_idx"
ON "Order"("businessUnitId", "recipientEmail");
