-- A PREVIEWED finance import may be cancelled with a reason, retained for
-- audit, and then re-preflighted. This never removes source artifacts or
-- changes an IMPORTED financial record.

ALTER TABLE "FinanceStatementImportBatch"
  ADD COLUMN "cancelledByMembershipId" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "FinanceStatementImportBatch"
  ADD CONSTRAINT "FinanceStatementImportBatch_cancellationReason_length"
  CHECK (
    "cancellationReason" IS NULL
    OR (char_length(btrim("cancellationReason")) BETWEEN 1 AND 500)
  ),
  ADD CONSTRAINT "FinanceStatementImportBatch_cancelledByMembershipId_fkey"
  FOREIGN KEY ("cancelledByMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinanceStatementImportBatch_businessUnitId_status_cancelledAt_idx"
  ON "FinanceStatementImportBatch"("businessUnitId", "status", "cancelledAt");

-- Stable Action key only. Role, menu and delegation relationships remain
-- database-configured and are intentionally not hard-coded here.
INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('finance.statement_import.cancel'), 'finance.statement_import.cancel', '取消账单预检', '取消尚未确认的账单预检并保留审计记录', 'finance', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
