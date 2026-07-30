-- Freeze the approval decision after it has been recorded. The baseline
-- state machine already limits legal transitions; this adds defense in depth
-- against native SQL changing a prior approval while cancelling or applying.

CREATE OR REPLACE FUNCTION "freeze_finance_allocation_adjustment_approval_facts"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'APPROVED'
    AND (
      NEW."approvedByMembershipId" IS DISTINCT FROM OLD."approvedByMembershipId"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."approvalReason" IS DISTINCT FROM OLD."approvalReason"
    ) THEN
    RAISE EXCEPTION 'FinancePaymentAllocationAdjustment approval facts are immutable after approval.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FinancePaymentAllocationAdjustment_freeze_approval_facts" ON "FinancePaymentAllocationAdjustment";
CREATE TRIGGER "FinancePaymentAllocationAdjustment_freeze_approval_facts"
BEFORE UPDATE ON "FinancePaymentAllocationAdjustment"
FOR EACH ROW EXECUTE FUNCTION "freeze_finance_allocation_adjustment_approval_facts"();
