-- Finance-control changes are security-sensitive configuration. A monotonic
-- version lets the API reject a stale administrator's write instead of
-- silently overwriting a later change.

ALTER TABLE "FinanceControlPolicy"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinanceControlPolicy"
  ADD CONSTRAINT "FinanceControlPolicy_version_positive"
  CHECK ("version" > 0);
