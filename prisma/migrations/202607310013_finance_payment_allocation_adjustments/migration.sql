-- Controlled correction for APPROVED payment allocations only.
-- The original allocation remains immutable. An approved adjustment appends a
-- reversal effect and a replacement allocation atomically. POSTED finance
-- facts remain locked until a dedicated accounting-entry module is introduced.

-- Version 012 deliberately blocks all allocation updates. Temporarily remove
-- only the trigger while this migration backfills its two new ownership
-- columns; the same immutable trigger is recreated below before the migration
-- commits.
DROP TRIGGER "FinancePaymentAllocation_immutable" ON "FinancePaymentAllocation";

ALTER TABLE "FinancePaymentAllocation"
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "businessUnitId" TEXT;

UPDATE "FinancePaymentAllocation" allocation
SET
  "legalEntityId" = payment."legalEntityId",
  "businessUnitId" = payment."businessUnitId"
FROM "FinancePayment" payment
WHERE payment."id" = allocation."paymentId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "FinancePaymentAllocation" allocation
    LEFT JOIN "FinancePayment" payment ON payment."id" = allocation."paymentId"
    LEFT JOIN "FinanceStatement" statement ON statement."id" = allocation."statementId"
    LEFT JOIN "Membership" creator ON creator."id" = allocation."createdByMembershipId"
    WHERE payment."id" IS NULL
      OR statement."id" IS NULL
      OR creator."id" IS NULL
      OR allocation."legalEntityId" IS NULL
      OR allocation."businessUnitId" IS NULL
      OR payment."legalEntityId" <> statement."legalEntityId"
      OR payment."businessUnitId" <> statement."businessUnitId"
      OR payment."counterpartyId" <> statement."counterpartyId"
      OR payment."currency" <> statement."currency"
      OR payment."currencyScale" <> statement."currencyScale"
      OR allocation."legalEntityId" <> payment."legalEntityId"
      OR allocation."businessUnitId" <> payment."businessUnitId"
      OR creator."legalEntityId" <> payment."legalEntityId"
      OR creator."businessUnitId" <> payment."businessUnitId"
  ) THEN
    RAISE EXCEPTION 'FinancePaymentAllocation backfill detected an inconsistent legacy allocation; correct it before applying controlled adjustments.';
  END IF;
END;
$$;

ALTER TABLE "FinancePaymentAllocation"
  ALTER COLUMN "legalEntityId" SET NOT NULL,
  ALTER COLUMN "businessUnitId" SET NOT NULL;

ALTER TABLE "FinancePaymentAllocation"
  ADD CONSTRAINT "FinancePaymentAllocation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FinancePaymentAllocation_legalEntityId_businessUnitId_idx"
  ON "FinancePaymentAllocation"("legalEntityId", "businessUnitId");

CREATE TYPE "FinancePaymentAllocationAdjustmentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'APPLIED'
);

CREATE TYPE "FinancePaymentAllocationEffectType" AS ENUM ('REVERSAL');

ALTER TABLE "FinanceControlPolicy"
  ADD COLUMN "requireAllocationAdjustmentApproverDifferentFromRequester" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requireAllocationAdjustmentApplierDifferentFromRequester" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requireAllocationAdjustmentApplierDifferentFromApprover" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "FinancePaymentAllocationAdjustment" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "sourceAllocationId" TEXT NOT NULL,
  "replacementStatementId" TEXT NOT NULL,
  "replacementAllocationId" TEXT,
  "amountCents" BIGINT NOT NULL,
  "status" "FinancePaymentAllocationAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestedByMembershipId" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedByMembershipId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalReason" TEXT,
  "rejectedByMembershipId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "cancelledByMembershipId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "appliedByMembershipId" TEXT,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePaymentAllocationAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePaymentAllocationAdjustment_amount_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "FinancePaymentAllocationAdjustment_reason_present" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 1000),
  CONSTRAINT "FinancePaymentAllocationAdjustment_idempotency_present" CHECK (char_length(btrim("idempotencyKey")) BETWEEN 8 AND 160)
);

CREATE TABLE "FinancePaymentAllocationEffect" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "type" "FinancePaymentAllocationEffectType" NOT NULL DEFAULT 'REVERSAL',
  "amountCents" BIGINT NOT NULL,
  "appliedByMembershipId" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePaymentAllocationEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePaymentAllocationEffect_amount_positive" CHECK ("amountCents" > 0)
);

CREATE UNIQUE INDEX "FinancePaymentAllocationAdjustment_replacementAllocationId_key"
  ON "FinancePaymentAllocationAdjustment"("replacementAllocationId");
CREATE UNIQUE INDEX "FinancePaymentAllocationAdjustment_sourceAllocationId_idempotencyKey_key"
  ON "FinancePaymentAllocationAdjustment"("sourceAllocationId", "idempotencyKey");
CREATE UNIQUE INDEX "FinancePaymentAllocationAdjustment_one_open_source_key"
  ON "FinancePaymentAllocationAdjustment"("sourceAllocationId")
  WHERE "status" IN ('PENDING', 'APPROVED');
CREATE INDEX "FinancePaymentAllocationAdjustment_businessUnitId_status_requestedAt_id_idx"
  ON "FinancePaymentAllocationAdjustment"("businessUnitId", "status", "requestedAt", "id");
CREATE INDEX "FinancePaymentAllocationAdjustment_replacementStatementId_status_requestedAt_idx"
  ON "FinancePaymentAllocationAdjustment"("replacementStatementId", "status", "requestedAt");
CREATE INDEX "FinancePaymentAllocationAdjustment_requestedByMembershipId_requestedAt_idx"
  ON "FinancePaymentAllocationAdjustment"("requestedByMembershipId", "requestedAt");

CREATE UNIQUE INDEX "FinancePaymentAllocationEffect_adjustmentId_key"
  ON "FinancePaymentAllocationEffect"("adjustmentId");
CREATE UNIQUE INDEX "FinancePaymentAllocationEffect_allocationId_type_key"
  ON "FinancePaymentAllocationEffect"("allocationId", "type");
CREATE INDEX "FinancePaymentAllocationEffect_legalEntityId_businessUnitId_idx"
  ON "FinancePaymentAllocationEffect"("legalEntityId", "businessUnitId");
CREATE INDEX "FinancePaymentAllocationEffect_allocationId_createdAt_idx"
  ON "FinancePaymentAllocationEffect"("allocationId", "createdAt");
CREATE INDEX "FinancePaymentAllocationEffect_appliedByMembershipId_appliedAt_idx"
  ON "FinancePaymentAllocationEffect"("appliedByMembershipId", "appliedAt");

ALTER TABLE "FinancePaymentAllocationAdjustment"
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_sourceAllocationId_fkey" FOREIGN KEY ("sourceAllocationId") REFERENCES "FinancePaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_replacementStatementId_fkey" FOREIGN KEY ("replacementStatementId") REFERENCES "FinanceStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_replacementAllocationId_fkey" FOREIGN KEY ("replacementAllocationId") REFERENCES "FinancePaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_requestedByMembershipId_fkey" FOREIGN KEY ("requestedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_rejectedByMembershipId_fkey" FOREIGN KEY ("rejectedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_cancelledByMembershipId_fkey" FOREIGN KEY ("cancelledByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationAdjustment_appliedByMembershipId_fkey" FOREIGN KEY ("appliedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePaymentAllocationEffect"
  ADD CONSTRAINT "FinancePaymentAllocationEffect_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationEffect_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationEffect_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "FinancePaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationEffect_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "FinancePaymentAllocationAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocationEffect_appliedByMembershipId_fkey" FOREIGN KEY ("appliedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A raw allocation insert must not be able to cross a company, business unit,
-- counterparty, currency or creator Membership boundary.
CREATE OR REPLACE FUNCTION "validate_finance_payment_allocation_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payment_row RECORD;
  statement_row RECORD;
  creator_row RECORD;
BEGIN
  SELECT * INTO payment_row FROM "FinancePayment" WHERE "id" = NEW."paymentId";
  SELECT * INTO statement_row FROM "FinanceStatement" WHERE "id" = NEW."statementId";
  SELECT * INTO creator_row FROM "Membership" WHERE "id" = NEW."createdByMembershipId";

  IF payment_row IS NULL OR statement_row IS NULL OR creator_row IS NULL THEN
    RAISE EXCEPTION 'FinancePaymentAllocation requires existing payment, statement and creator membership.';
  END IF;
  IF payment_row."legalEntityId" <> statement_row."legalEntityId"
    OR payment_row."businessUnitId" <> statement_row."businessUnitId"
    OR payment_row."counterpartyId" <> statement_row."counterpartyId"
    OR payment_row."currency" <> statement_row."currency"
    OR payment_row."currencyScale" <> statement_row."currencyScale" THEN
    RAISE EXCEPTION 'FinancePaymentAllocation payment and statement must share organization, counterparty and currency.';
  END IF;
  IF NEW."legalEntityId" <> payment_row."legalEntityId"
    OR NEW."businessUnitId" <> payment_row."businessUnitId"
    OR creator_row."legalEntityId" <> payment_row."legalEntityId"
    OR creator_row."businessUnitId" <> payment_row."businessUnitId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocation organization or creator membership scope mismatch.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinancePaymentAllocation_scope_guard"
BEFORE INSERT ON "FinancePaymentAllocation"
FOR EACH ROW
EXECUTE FUNCTION "validate_finance_payment_allocation_scope"();

CREATE TRIGGER "FinancePaymentAllocation_immutable"
BEFORE UPDATE OR DELETE ON "FinancePaymentAllocation"
FOR EACH ROW
EXECUTE FUNCTION "prevent_finance_payment_allocation_mutation"();

CREATE OR REPLACE FUNCTION "validate_finance_allocation_adjustment_row"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  source_row RECORD;
  source_payment RECORD;
  source_statement RECORD;
  replacement_statement RECORD;
  requester_row RECORD;
  membership_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment rows are append-only; cancel or reject the request instead.';
  END IF;

  SELECT * INTO source_row FROM "FinancePaymentAllocation" WHERE "id" = NEW."sourceAllocationId";
  IF source_row IS NULL THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment source allocation does not exist.';
  END IF;
  SELECT * INTO source_payment FROM "FinancePayment" WHERE "id" = source_row."paymentId";
  SELECT * INTO source_statement FROM "FinanceStatement" WHERE "id" = source_row."statementId";
  SELECT * INTO replacement_statement FROM "FinanceStatement" WHERE "id" = NEW."replacementStatementId";
  SELECT * INTO requester_row FROM "Membership" WHERE "id" = NEW."requestedByMembershipId";
  IF source_payment IS NULL OR source_statement IS NULL OR replacement_statement IS NULL OR requester_row IS NULL THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment references a missing source or requester.';
  END IF;
  IF NEW."sourceAllocationId" = NEW."replacementStatementId" OR source_row."statementId" = NEW."replacementStatementId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment replacement statement must differ from the source statement.';
  END IF;
  IF NEW."amountCents" <> source_row."amountCents" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment currently supports only a full allocation adjustment.';
  END IF;
  IF NEW."legalEntityId" <> source_payment."legalEntityId"
    OR NEW."businessUnitId" <> source_payment."businessUnitId"
    OR source_statement."legalEntityId" <> source_payment."legalEntityId"
    OR source_statement."businessUnitId" <> source_payment."businessUnitId"
    OR replacement_statement."legalEntityId" <> source_payment."legalEntityId"
    OR replacement_statement."businessUnitId" <> source_payment."businessUnitId"
    OR source_payment."counterpartyId" <> replacement_statement."counterpartyId"
    OR source_payment."currency" <> replacement_statement."currency"
    OR source_payment."currencyScale" <> replacement_statement."currencyScale"
    OR requester_row."legalEntityId" <> source_payment."legalEntityId"
    OR requester_row."businessUnitId" <> source_payment."businessUnitId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment organization, counterparty, currency or requester scope mismatch.';
  END IF;

  FOREACH membership_id IN ARRAY ARRAY[
    NEW."approvedByMembershipId",
    NEW."rejectedByMembershipId",
    NEW."cancelledByMembershipId",
    NEW."appliedByMembershipId"
  ] LOOP
    IF membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Membership"
      WHERE "id" = membership_id
        AND "legalEntityId" = NEW."legalEntityId"
        AND "businessUnitId" = NEW."businessUnitId"
    ) THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment actor membership scope mismatch.';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING'
      OR NEW."approvedByMembershipId" IS NOT NULL
      OR NEW."rejectedByMembershipId" IS NOT NULL
      OR NEW."cancelledByMembershipId" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL
      OR NEW."replacementAllocationId" IS NOT NULL THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment must start as PENDING with no decision facts.';
    END IF;
    IF source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED' THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment requires APPROVED payment, source statement and replacement statement.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."legalEntityId" IS DISTINCT FROM OLD."legalEntityId"
    OR NEW."businessUnitId" IS DISTINCT FROM OLD."businessUnitId"
    OR NEW."sourceAllocationId" IS DISTINCT FROM OLD."sourceAllocationId"
    OR NEW."replacementStatementId" IS DISTINCT FROM OLD."replacementStatementId"
    OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestedByMembershipId" IS DISTINCT FROM OLD."requestedByMembershipId"
    OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment request facts are immutable.';
  END IF;

  IF OLD."status" = 'PENDING' AND NEW."status" = 'APPROVED' THEN
    IF NEW."approvedByMembershipId" IS NULL OR NEW."approvedAt" IS NULL
      OR source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED' THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment approval requires an approver and all sources to remain APPROVED.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'PENDING' AND NEW."status" = 'REJECTED' THEN
    IF NEW."rejectedByMembershipId" IS NULL OR NEW."rejectedAt" IS NULL OR char_length(btrim(COALESCE(NEW."rejectionReason", ''))) < 3 THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment rejection requires an actor, timestamp and reason.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" IN ('PENDING', 'APPROVED') AND NEW."status" = 'CANCELLED' THEN
    IF NEW."cancelledByMembershipId" IS NULL OR NEW."cancelledAt" IS NULL OR char_length(btrim(COALESCE(NEW."cancellationReason", ''))) < 3 THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment cancellation requires an actor, timestamp and reason.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" = 'APPLIED' THEN
    IF NEW."appliedByMembershipId" IS NULL OR NEW."appliedAt" IS NULL OR NEW."replacementAllocationId" IS NULL
      OR source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED' THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment application requires an applier, replacement allocation and APPROVED sources.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid FinancePaymentAllocationAdjustment status transition.';
END;
$$;

CREATE TRIGGER "FinancePaymentAllocationAdjustment_state_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "FinancePaymentAllocationAdjustment"
FOR EACH ROW
EXECUTE FUNCTION "validate_finance_allocation_adjustment_row"();

CREATE OR REPLACE FUNCTION "validate_finance_payment_allocation_effect"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  adjustment_row RECORD;
  allocation_row RECORD;
  replacement_row RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'FinancePaymentAllocationEffect rows are immutable.';
  END IF;
  SELECT * INTO adjustment_row FROM "FinancePaymentAllocationAdjustment" WHERE "id" = NEW."adjustmentId";
  SELECT * INTO allocation_row FROM "FinancePaymentAllocation" WHERE "id" = NEW."allocationId";
  IF adjustment_row IS NULL OR allocation_row IS NULL THEN
    RAISE EXCEPTION 'FinancePaymentAllocationEffect requires an existing adjustment and allocation.';
  END IF;
  IF adjustment_row."status" <> 'APPLIED'
    OR NEW."type" <> 'REVERSAL'
    OR NEW."allocationId" <> adjustment_row."sourceAllocationId"
    OR NEW."amountCents" <> adjustment_row."amountCents"
    OR NEW."legalEntityId" <> adjustment_row."legalEntityId"
    OR NEW."businessUnitId" <> adjustment_row."businessUnitId"
    OR NEW."appliedByMembershipId" <> adjustment_row."appliedByMembershipId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationEffect does not match its applied adjustment.';
  END IF;
  SELECT * INTO replacement_row FROM "FinancePaymentAllocation" WHERE "id" = adjustment_row."replacementAllocationId";
  IF replacement_row IS NULL
    OR replacement_row."paymentId" <> allocation_row."paymentId"
    OR replacement_row."statementId" <> adjustment_row."replacementStatementId"
    OR replacement_row."amountCents" <> adjustment_row."amountCents"
    OR replacement_row."legalEntityId" <> adjustment_row."legalEntityId"
    OR replacement_row."businessUnitId" <> adjustment_row."businessUnitId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationEffect replacement allocation is invalid.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinancePaymentAllocationEffect_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "FinancePaymentAllocationEffect"
FOR EACH ROW
EXECUTE FUNCTION "validate_finance_payment_allocation_effect"();

-- At commit, every APPLIED adjustment must have exactly one linked reversal
-- effect. The deferred trigger permits the service to write the new allocation,
-- status change and effect within a single serializable transaction.
CREATE OR REPLACE FUNCTION "validate_finance_allocation_adjustment_completion"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  adjustment_id TEXT;
  adjustment_row RECORD;
BEGIN
  adjustment_id := COALESCE(NEW."id", OLD."id");
  SELECT * INTO adjustment_row FROM "FinancePaymentAllocationAdjustment" WHERE "id" = adjustment_id;
  IF adjustment_row IS NOT NULL AND adjustment_row."status" = 'APPLIED' AND NOT EXISTS (
    SELECT 1 FROM "FinancePaymentAllocationEffect" WHERE "adjustmentId" = adjustment_row."id"
  ) THEN
    RAISE EXCEPTION 'Applied FinancePaymentAllocationAdjustment must include one immutable reversal effect.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "FinancePaymentAllocationAdjustment_completion_guard"
AFTER INSERT OR UPDATE ON "FinancePaymentAllocationAdjustment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "validate_finance_allocation_adjustment_completion"();

INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('finance.allocation_adjustment.read'), 'finance.allocation_adjustment.read', '查看核销调整', '查看当前授权范围内的付款核销调整申请', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.allocation_adjustment.request'), 'finance.allocation_adjustment.request', '申请核销调整', '为已批准的付款核销提交全额调整申请', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.allocation_adjustment.approve'), 'finance.allocation_adjustment.approve', '审核核销调整', '审核或驳回付款核销调整申请', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.allocation_adjustment.apply'), 'finance.allocation_adjustment.apply', '执行核销调整', '追加冲销效果并生成替代付款核销', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.allocation_adjustment.cancel'), 'finance.allocation_adjustment.cancel', '取消核销调整', '取消尚未执行的付款核销调整申请', 'finance', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- This remains data-driven: no role, MenuPermission or AccessGrant is created
-- here. Administrators explicitly decide who can see and perform the flow.
INSERT INTO "Menu" ("id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive", "requiredActionKey", "requiredCondition", "createdAt", "updatedAt")
VALUES (md5('group-finance'), 'group-finance', '财务与审批', '/admin/finance-settlements', 'WalletCards', NULL, 50, true, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Menu" ("id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive", "requiredActionKey", "requiredCondition", "createdAt", "updatedAt")
SELECT md5('finance-allocation-adjustments'), 'finance-allocation-adjustments', '核销调整', '/admin/finance-allocation-adjustments', 'Scale', parent."id", 148, true, 'finance.allocation_adjustment.read', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Menu" parent
WHERE parent."key" = 'group-finance'
ON CONFLICT ("key") DO NOTHING;
