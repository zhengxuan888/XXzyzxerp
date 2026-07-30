-- Database-driven finance maker/checker policy. The rows deliberately belong
-- to a business unit; no company, department or role name is embedded in code.
-- All switches are strict by default so a missing/unfinished configuration
-- cannot silently permit a self-approved financial fact.

CREATE TABLE "FinanceControlPolicy" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "requireStatementApproverDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true,
  "requireStatementPosterDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true,
  "requireStatementPosterDifferentFromApprover" BOOLEAN NOT NULL DEFAULT true,
  "requirePaymentApproverDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true,
  "requirePaymentPosterDifferentFromCreator" BOOLEAN NOT NULL DEFAULT true,
  "requirePaymentPosterDifferentFromApprover" BOOLEAN NOT NULL DEFAULT true,
  "updatedByMembershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceControlPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceControlPolicy_businessUnitId_key"
  ON "FinanceControlPolicy"("businessUnitId");
CREATE INDEX "FinanceControlPolicy_legalEntityId_idx"
  ON "FinanceControlPolicy"("legalEntityId");
CREATE INDEX "FinanceControlPolicy_updatedByMembershipId_updatedAt_idx"
  ON "FinanceControlPolicy"("updatedByMembershipId", "updatedAt");

ALTER TABLE "FinanceControlPolicy"
  ADD CONSTRAINT "FinanceControlPolicy_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceControlPolicy_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceControlPolicy_updatedByMembershipId_fkey"
  FOREIGN KEY ("updatedByMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing business units start in the strict configuration. The id is
-- deterministic only for migration idempotence; V2 application IDs stay UUIDs.
INSERT INTO "FinanceControlPolicy" (
  "id", "legalEntityId", "businessUnitId",
  "requireStatementApproverDifferentFromCreator",
  "requireStatementPosterDifferentFromCreator",
  "requireStatementPosterDifferentFromApprover",
  "requirePaymentApproverDifferentFromCreator",
  "requirePaymentPosterDifferentFromCreator",
  "requirePaymentPosterDifferentFromApprover",
  "createdAt", "updatedAt"
)
SELECT
  md5('finance-control-policy:' || "id"), "legalEntityId", "id",
  true, true, true, true, true, true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessUnit"
ON CONFLICT ("businessUnitId") DO NOTHING;

-- Stable actions only. Role, menu and delegation mappings stay in database
-- configuration and are not embedded in this migration.
INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('finance.control_policy.read'), 'finance.control_policy.read', '查看财务内控规则', '查看当前业务板块的财务岗位分离规则', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.control_policy.manage'), 'finance.control_policy.manage', '配置财务内控规则', '配置当前业务板块的财务岗位分离规则', 'finance', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
