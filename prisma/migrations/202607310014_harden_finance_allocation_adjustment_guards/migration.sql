-- Follow-up hardening for the already-applied allocation-adjustment baseline.
-- It preserves every immutable financial fact and tightens cross-table state
-- validation rather than changing or deleting historical records.

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
  replacement_allocation RECORD;
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
  IF source_row."statementId" = NEW."replacementStatementId" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment replacement statement must differ from the source statement.';
  END IF;
  IF NEW."amountCents" <> source_row."amountCents" THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment currently supports only a full allocation adjustment.';
  END IF;
  IF NEW."legalEntityId" IS DISTINCT FROM source_payment."legalEntityId"
    OR NEW."businessUnitId" IS DISTINCT FROM source_payment."businessUnitId"
    OR source_statement."legalEntityId" IS DISTINCT FROM source_payment."legalEntityId"
    OR source_statement."businessUnitId" IS DISTINCT FROM source_payment."businessUnitId"
    OR replacement_statement."legalEntityId" IS DISTINCT FROM source_payment."legalEntityId"
    OR replacement_statement."businessUnitId" IS DISTINCT FROM source_payment."businessUnitId"
    OR source_payment."counterpartyId" IS DISTINCT FROM replacement_statement."counterpartyId"
    OR source_payment."currency" IS DISTINCT FROM replacement_statement."currency"
    OR source_payment."currencyScale" IS DISTINCT FROM replacement_statement."currencyScale"
    OR requester_row."legalEntityId" IS DISTINCT FROM source_payment."legalEntityId"
    OR requester_row."businessUnitId" IS DISTINCT FROM source_payment."businessUnitId" THEN
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
      OR NEW."approvedByMembershipId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW."approvalReason" IS NOT NULL
      OR NEW."rejectedByMembershipId" IS NOT NULL OR NEW."rejectedAt" IS NOT NULL OR NEW."rejectionReason" IS NOT NULL
      OR NEW."cancelledByMembershipId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL OR NEW."appliedAt" IS NOT NULL
      OR NEW."replacementAllocationId" IS NOT NULL THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment must start as PENDING with no decision facts.';
    END IF;
    IF source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED' THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment requires APPROVED payment, source statement and replacement statement.';
    END IF;
    IF EXISTS (SELECT 1 FROM "FinancePaymentAllocationEffect" WHERE "allocationId" = source_row."id") THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment source allocation was already reversed.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."legalEntityId" IS DISTINCT FROM OLD."legalEntityId"
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
      OR NEW."rejectedByMembershipId" IS NOT NULL OR NEW."rejectedAt" IS NOT NULL OR NEW."rejectionReason" IS NOT NULL
      OR NEW."cancelledByMembershipId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL OR NEW."appliedAt" IS NOT NULL OR NEW."replacementAllocationId" IS NOT NULL
      OR source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED' THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment approval requires an approver, clean decision facts and APPROVED sources.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PENDING' AND NEW."status" = 'REJECTED' THEN
    IF NEW."rejectedByMembershipId" IS NULL OR NEW."rejectedAt" IS NULL OR char_length(btrim(COALESCE(NEW."rejectionReason", ''))) < 3
      OR NEW."approvedByMembershipId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW."approvalReason" IS NOT NULL
      OR NEW."cancelledByMembershipId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL OR NEW."appliedAt" IS NOT NULL OR NEW."replacementAllocationId" IS NOT NULL THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment rejection requires only a reject decision with an actor, timestamp and reason.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PENDING' AND NEW."status" = 'CANCELLED' THEN
    IF NEW."cancelledByMembershipId" IS NULL OR NEW."cancelledAt" IS NULL OR char_length(btrim(COALESCE(NEW."cancellationReason", ''))) < 3
      OR NEW."approvedByMembershipId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW."approvalReason" IS NOT NULL
      OR NEW."rejectedByMembershipId" IS NOT NULL OR NEW."rejectedAt" IS NOT NULL OR NEW."rejectionReason" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL OR NEW."appliedAt" IS NOT NULL OR NEW."replacementAllocationId" IS NOT NULL THEN
      RAISE EXCEPTION 'Pending FinancePaymentAllocationAdjustment cancellation requires only a cancellation decision.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'APPROVED' AND NEW."status" = 'CANCELLED' THEN
    IF NEW."approvedByMembershipId" IS NULL OR NEW."approvedAt" IS NULL
      OR NEW."cancelledByMembershipId" IS NULL OR NEW."cancelledAt" IS NULL OR char_length(btrim(COALESCE(NEW."cancellationReason", ''))) < 3
      OR NEW."rejectedByMembershipId" IS NOT NULL OR NEW."rejectedAt" IS NOT NULL OR NEW."rejectionReason" IS NOT NULL
      OR NEW."appliedByMembershipId" IS NOT NULL OR NEW."appliedAt" IS NOT NULL OR NEW."replacementAllocationId" IS NOT NULL THEN
      RAISE EXCEPTION 'Approved FinancePaymentAllocationAdjustment cancellation requires its original approval and a cancellation decision.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'APPROVED' AND NEW."status" = 'APPLIED' THEN
    SELECT * INTO replacement_allocation FROM "FinancePaymentAllocation" WHERE "id" = NEW."replacementAllocationId";
    IF NEW."approvedByMembershipId" IS NULL OR NEW."approvedAt" IS NULL
      OR NEW."appliedByMembershipId" IS NULL OR NEW."appliedAt" IS NULL OR NEW."replacementAllocationId" IS NULL
      OR NEW."rejectedByMembershipId" IS NOT NULL OR NEW."rejectedAt" IS NOT NULL OR NEW."rejectionReason" IS NOT NULL
      OR NEW."cancelledByMembershipId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL
      OR source_payment."status" <> 'APPROVED'
      OR source_statement."status" <> 'APPROVED'
      OR replacement_statement."status" <> 'APPROVED'
      OR replacement_allocation IS NULL
      OR replacement_allocation."paymentId" <> source_row."paymentId"
      OR replacement_allocation."statementId" <> NEW."replacementStatementId"
      OR replacement_allocation."amountCents" <> NEW."amountCents"
      OR replacement_allocation."legalEntityId" <> NEW."legalEntityId"
      OR replacement_allocation."businessUnitId" <> NEW."businessUnitId"
      OR replacement_allocation."createdByMembershipId" <> NEW."appliedByMembershipId" THEN
      RAISE EXCEPTION 'FinancePaymentAllocationAdjustment application requires an approved, matching replacement allocation created by the applier.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid FinancePaymentAllocationAdjustment status transition.';
END;
$$;
