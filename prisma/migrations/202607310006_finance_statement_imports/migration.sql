-- Configurable finance statement templates and private workbook staging.
-- A source workbook is not a financial fact: only an explicit, authorized
-- confirmation may create DRAFT FinanceStatement rows.

CREATE TYPE "FinanceStatementImportBatchStatus" AS ENUM (
  'PREVIEWED',
  'IMPORTING',
  'IMPORTED',
  'CANCELLED'
);

CREATE TYPE "FinanceStatementImportRowStatus" AS ENUM (
  'READY',
  'WARNING',
  'REJECTED',
  'IMPORTED',
  'SKIPPED'
);

CREATE TABLE "FinanceStatementTemplate" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "counterpartyId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "configuration" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatementTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatementTemplate_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "FinanceStatementImportBatch" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "templateId" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "templateSnapshot" JSONB NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "statementNoPrefix" TEXT NOT NULL,
  "externalReference" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "status" "FinanceStatementImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "readyRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "rejectedRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "previewedByMembershipId" TEXT NOT NULL,
  "previewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedByMembershipId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatementImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatementImportBatch_template_version_positive" CHECK ("templateVersion" > 0),
  CONSTRAINT "FinanceStatementImportBatch_size_positive" CHECK ("sizeBytes" > 0),
  CONSTRAINT "FinanceStatementImportBatch_counts_nonnegative" CHECK (
    "totalRows" >= 0 AND "readyRows" >= 0 AND "warningRows" >= 0
    AND "rejectedRows" >= 0 AND "importedRows" >= 0
  ),
  CONSTRAINT "FinanceStatementImportBatch_period_order" CHECK (
    "periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd"
  )
);

CREATE TABLE "FinanceStatementImportSheet" (
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sheetKey" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "headerRowNumber" INTEGER NOT NULL,
  "statementNo" TEXT NOT NULL,
  "statementType" "FinanceStatementType" NOT NULL,
  "currency" TEXT NOT NULL,
  "currencyScale" INTEGER NOT NULL DEFAULT 2,
  "totalAmountCents" BIGINT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "readyRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "rejectedRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "createdStatementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatementImportSheet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatementImportSheet_header_row_positive" CHECK ("headerRowNumber" > 0),
  CONSTRAINT "FinanceStatementImportSheet_currency_scale" CHECK ("currencyScale" BETWEEN 0 AND 6),
  CONSTRAINT "FinanceStatementImportSheet_amount_nonnegative" CHECK ("totalAmountCents" >= 0),
  CONSTRAINT "FinanceStatementImportSheet_counts_nonnegative" CHECK (
    "totalRows" >= 0 AND "readyRows" >= 0 AND "warningRows" >= 0
    AND "rejectedRows" >= 0 AND "importedRows" >= 0
  )
);

CREATE TABLE "FinanceStatementImportRow" (
  "id" TEXT NOT NULL,
  "importSheetId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "sourceRowHash" TEXT NOT NULL,
  "status" "FinanceStatementImportRowStatus" NOT NULL DEFAULT 'READY',
  "issueCodes" JSONB,
  "message" TEXT,
  "sourceReference" TEXT,
  "trackingReference" TEXT,
  "description" TEXT,
  "currency" TEXT,
  "currencyScale" INTEGER,
  "amountCents" BIGINT,
  "sourceSnapshot" JSONB,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatementImportRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatementImportRow_row_number_positive" CHECK ("rowNumber" > 0),
  CONSTRAINT "FinanceStatementImportRow_currency_scale" CHECK ("currencyScale" IS NULL OR "currencyScale" BETWEEN 0 AND 6),
  CONSTRAINT "FinanceStatementImportRow_amount_positive" CHECK ("amountCents" IS NULL OR "amountCents" > 0)
);

CREATE UNIQUE INDEX "FinanceStatementTemplate_businessUnitId_code_key"
  ON "FinanceStatementTemplate"("businessUnitId", "code");
CREATE INDEX "FinanceStatementTemplate_businessUnitId_isActive_createdAt_idx"
  ON "FinanceStatementTemplate"("businessUnitId", "isActive", "createdAt");
CREATE INDEX "FinanceStatementTemplate_departmentId_isActive_idx"
  ON "FinanceStatementTemplate"("departmentId", "isActive");
CREATE INDEX "FinanceStatementTemplate_counterpartyId_isActive_idx"
  ON "FinanceStatementTemplate"("counterpartyId", "isActive");
CREATE INDEX "FinanceStatementTemplate_createdByMembershipId_createdAt_idx"
  ON "FinanceStatementTemplate"("createdByMembershipId", "createdAt");

CREATE INDEX "FinanceStatementImportBatch_businessUnitId_status_previewedAt_id_idx"
  ON "FinanceStatementImportBatch"("businessUnitId", "status", "previewedAt", "id");
CREATE INDEX "FinanceStatementImportBatch_departmentId_status_previewedAt_idx"
  ON "FinanceStatementImportBatch"("departmentId", "status", "previewedAt");
CREATE INDEX "FinanceStatementImportBatch_counterpartyId_status_idx"
  ON "FinanceStatementImportBatch"("counterpartyId", "status");
CREATE INDEX "FinanceStatementImportBatch_templateId_createdAt_idx"
  ON "FinanceStatementImportBatch"("templateId", "createdAt");
CREATE INDEX "FinanceStatementImportBatch_previewedByMembershipId_previewedAt_idx"
  ON "FinanceStatementImportBatch"("previewedByMembershipId", "previewedAt");

-- Re-uploading the same source file into the same counterparty domain must
-- return the existing preview/import, not create a duplicate payable fact.
CREATE UNIQUE INDEX "FinanceStatementImportBatch_active_source_key"
  ON "FinanceStatementImportBatch"("businessUnitId", "counterpartyId", "sha256")
  WHERE "status" IN ('PREVIEWED', 'IMPORTING', 'IMPORTED');

CREATE UNIQUE INDEX "FinanceStatementImportSheet_createdStatementId_key"
  ON "FinanceStatementImportSheet"("createdStatementId");
CREATE UNIQUE INDEX "FinanceStatementImportSheet_importBatchId_sheetKey_key"
  ON "FinanceStatementImportSheet"("importBatchId", "sheetKey");
CREATE UNIQUE INDEX "FinanceStatementImportSheet_importBatchId_statementNo_key"
  ON "FinanceStatementImportSheet"("importBatchId", "statementNo");
CREATE INDEX "FinanceStatementImportSheet_importBatchId_createdAt_idx"
  ON "FinanceStatementImportSheet"("importBatchId", "createdAt");

CREATE UNIQUE INDEX "FinanceStatementImportRow_importSheetId_rowNumber_key"
  ON "FinanceStatementImportRow"("importSheetId", "rowNumber");
CREATE INDEX "FinanceStatementImportRow_importSheetId_status_rowNumber_idx"
  ON "FinanceStatementImportRow"("importSheetId", "status", "rowNumber");
CREATE INDEX "FinanceStatementImportRow_sourceReference_idx"
  ON "FinanceStatementImportRow"("sourceReference");
CREATE INDEX "FinanceStatementImportRow_trackingReference_idx"
  ON "FinanceStatementImportRow"("trackingReference");

ALTER TABLE "FinanceStatementTemplate"
  ADD CONSTRAINT "FinanceStatementTemplate_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementTemplate_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementTemplate_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "FinanceCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementTemplate_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementImportBatch"
  ADD CONSTRAINT "FinanceStatementImportBatch_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FinanceStatementTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "FinanceCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_previewedByMembershipId_fkey" FOREIGN KEY ("previewedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportBatch_confirmedByMembershipId_fkey" FOREIGN KEY ("confirmedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementImportSheet"
  ADD CONSTRAINT "FinanceStatementImportSheet_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "FinanceStatementImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementImportSheet_createdStatementId_fkey" FOREIGN KEY ("createdStatementId") REFERENCES "FinanceStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementImportRow"
  ADD CONSTRAINT "FinanceStatementImportRow_importSheetId_fkey" FOREIGN KEY ("importSheetId") REFERENCES "FinanceStatementImportSheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Actions are stable identifiers. No role/menu-permission/delegation mapping
-- is copied: access stays fail-closed until configured by an authorized user.
INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('finance.statement_template.read'), 'finance.statement_template.read', '查看账单模板', '查看当前授权范围内的账单模板配置', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement_template.manage'), 'finance.statement_template.manage', '管理账单模板', '创建、更新或停用账单模板配置', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement_import.read'), 'finance.statement_import.read', '查看账单导入预检', '查看当前授权范围内的账单导入批次与校验结果', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement_import.preview'), 'finance.statement_import.preview', '预检账单导入', '私有上传并预检账单工作簿，不产生财务事实', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement_import.confirm'), 'finance.statement_import.confirm', '确认账单导入', '确认预检通过的工作簿并创建结算草稿', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement_artifact.read'), 'finance.statement_artifact.read', '下载账单原件', '读取私有保存的账单原始文件', 'finance', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Menu" ("id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive", "requiredActionKey", "requiredCondition", "updatedAt")
SELECT md5('finance-statement-imports'), 'finance-statement-imports', '账单模板与导入', '/admin/finance-imports', 'FileSpreadsheet', parent."id", 146, true, 'finance.statement_import.read', NULL, CURRENT_TIMESTAMP
FROM "Menu" parent
WHERE parent."key" = 'group-finance'
ON CONFLICT ("key") DO NOTHING;
