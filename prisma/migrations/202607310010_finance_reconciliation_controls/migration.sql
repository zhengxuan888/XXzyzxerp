-- Reconciliation suggestions are financial control decisions. Fail closed so
-- the employee who creates a suggestion cannot resolve it alone by default.

ALTER TABLE "FinanceControlPolicy"
  ADD COLUMN "requireReconciliationResolverDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true;
