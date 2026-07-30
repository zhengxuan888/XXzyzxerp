-- A payment allocation is a financial control decision between approval and
-- posting. Fail closed so the maker or approver cannot allocate alone.

ALTER TABLE "FinanceControlPolicy"
  ADD COLUMN "requirePaymentAllocatorDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requirePaymentAllocatorDifferentFromApprover" BOOLEAN NOT NULL DEFAULT true;
