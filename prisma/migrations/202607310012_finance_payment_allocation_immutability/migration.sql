-- A payment may legitimately settle the same statement in more than one
-- installment. Preserve every allocation as an immutable event instead of
-- collapsing or overwriting the first one.

ALTER TABLE "FinancePaymentAllocation"
  ADD COLUMN "idempotencyKey" TEXT;

-- Existing local/demo allocations predate request keys. Give each a stable
-- migration key so the new NOT NULL and uniqueness guarantees are safe.
UPDATE "FinancePaymentAllocation"
SET "idempotencyKey" = CONCAT('legacy:', "id")
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "FinancePaymentAllocation"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

DROP INDEX "FinancePaymentAllocation_paymentId_statementId_key";

CREATE UNIQUE INDEX "FinancePaymentAllocation_paymentId_idempotencyKey_key"
  ON "FinancePaymentAllocation"("paymentId", "idempotencyKey");

CREATE INDEX "FinancePaymentAllocation_paymentId_statementId_createdAt_idx"
  ON "FinancePaymentAllocation"("paymentId", "statementId", "createdAt");

-- Allocation corrections must be represented by a later, explicitly
-- authorized financial effect. Direct mutation or deletion would erase the
-- audit trail and make posted balances unverifiable.
CREATE OR REPLACE FUNCTION "prevent_finance_payment_allocation_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FinancePaymentAllocation rows are immutable; use the controlled adjustment workflow.';
END;
$$;

CREATE TRIGGER "FinancePaymentAllocation_immutable"
BEFORE UPDATE OR DELETE ON "FinancePaymentAllocation"
FOR EACH ROW
EXECUTE FUNCTION "prevent_finance_payment_allocation_mutation"();
