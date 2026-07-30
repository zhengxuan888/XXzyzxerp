-- Finance integrity hardening. This migration is V2-only and intentionally
-- preserves finance facts when organization records are soft-disabled.

ALTER TYPE "FinanceReconciliationStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "FinanceReconciliation"
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "counterpartyId" TEXT,
  ADD COLUMN "statementType" "FinanceStatementType",
  ADD COLUMN "voidedByMembershipId" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3);

-- Backfill the claim domain from the owning statement before making the
-- fields mandatory. This does not read or import any legacy data.
UPDATE "FinanceReconciliation" AS reconciliation
SET
  "legalEntityId" = statement."legalEntityId",
  "businessUnitId" = statement."businessUnitId",
  "counterpartyId" = statement."counterpartyId",
  "statementType" = statement."type"
FROM "FinanceStatementLine" AS line
JOIN "FinanceStatement" AS statement ON statement."id" = line."statementId"
WHERE reconciliation."statementLineId" = line."id";

ALTER TABLE "FinanceReconciliation"
  ALTER COLUMN "legalEntityId" SET NOT NULL,
  ALTER COLUMN "businessUnitId" SET NOT NULL,
  ALTER COLUMN "counterpartyId" SET NOT NULL,
  ALTER COLUMN "statementType" SET NOT NULL;

-- Finance facts must never disappear because an organization record was
-- physically removed. Administrative deletion is soft-disable only.
ALTER TABLE "FinanceCounterparty"
  DROP CONSTRAINT IF EXISTS "FinanceCounterparty_legalEntityId_fkey",
  DROP CONSTRAINT IF EXISTS "FinanceCounterparty_businessUnitId_fkey",
  ADD CONSTRAINT "FinanceCounterparty_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCounterparty_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceStatement"
  DROP CONSTRAINT IF EXISTS "FinanceStatement_legalEntityId_fkey",
  DROP CONSTRAINT IF EXISTS "FinanceStatement_businessUnitId_fkey",
  ADD CONSTRAINT "FinanceStatement_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementLine"
  DROP CONSTRAINT IF EXISTS "FinanceStatementLine_statementId_fkey",
  ADD CONSTRAINT "FinanceStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FinanceStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceReconciliation"
  DROP CONSTRAINT IF EXISTS "FinanceReconciliation_statementLineId_fkey",
  ADD CONSTRAINT "FinanceReconciliation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "FinanceCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "FinanceStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_voidedByMembershipId_fkey" FOREIGN KEY ("voidedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePayment"
  DROP CONSTRAINT IF EXISTS "FinancePayment_legalEntityId_fkey",
  DROP CONSTRAINT IF EXISTS "FinancePayment_businessUnitId_fkey",
  ADD CONSTRAINT "FinancePayment_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FinanceReconciliation_businessUnitId_counterpartyId_statementType_status_idx"
  ON "FinanceReconciliation"("businessUnitId", "counterpartyId", "statementType", "status");

-- A claim is unique only inside its accounting domain. The same order may be
-- legitimately referenced once for COD remittance and once for shipping fee,
-- but cannot be confirmed twice for the same counterparty/type. Voiding a
-- statement moves its confirmed claims to VOIDED and releases this index.
CREATE UNIQUE INDEX "FinanceReconciliation_confirmed_order_claim_key"
  ON "FinanceReconciliation"("businessUnitId", "counterpartyId", "statementType", "orderId")
  WHERE "status" = 'CONFIRMED' AND "orderId" IS NOT NULL;

CREATE UNIQUE INDEX "FinanceReconciliation_confirmed_shipment_claim_key"
  ON "FinanceReconciliation"("businessUnitId", "counterpartyId", "statementType", "shipmentId")
  WHERE "status" = 'CONFIRMED' AND "shipmentId" IS NOT NULL;
