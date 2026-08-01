-- Database-driven marketing operations foundation. Source/account labels,
-- metrics, lifecycle states, tags and scopes are configuration records rather
-- than role, department or platform checks embedded in application code.

CREATE TYPE "MarketingReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'LOCKED');
CREATE TYPE "MarketingMetricValueType" AS ENUM ('COUNT', 'MONEY_CENTS', 'DECIMAL', 'PERCENT');
CREATE TYPE "MarketingMetricAggregation" AS ENUM ('SUM', 'AVG', 'LAST');
CREATE TYPE "MarketingMetricCalculation" AS ENUM ('DIRECT', 'RATIO');
CREATE TYPE "MarketingKpiScopeType" AS ENUM ('BUSINESS_UNIT', 'DEPARTMENT', 'MEMBERSHIP');
CREATE TYPE "MarketingCreativeAssetPurpose" AS ENUM ('PRIMARY', 'SUPPORTING', 'COPY_REFERENCE');

CREATE TABLE "MarketingWorkbenchSetting" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "cards" JSONB NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingWorkbenchSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingSource" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "parentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SOURCE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingMetricDefinition" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "valueType" "MarketingMetricValueType" NOT NULL,
  "aggregation" "MarketingMetricAggregation" NOT NULL DEFAULT 'SUM',
  "calculation" "MarketingMetricCalculation" NOT NULL DEFAULT 'DIRECT',
  "numeratorMetricCode" TEXT,
  "denominatorMetricCode" TEXT,
  "multiplier" DECIMAL(20,6),
  "inputRequired" BOOLEAN NOT NULL DEFAULT false,
  "showOnWorkbench" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingMetricDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingMetricDefinition_formula_check" CHECK (
    ("calculation" = 'DIRECT' AND "numeratorMetricCode" IS NULL AND "denominatorMetricCode" IS NULL AND "multiplier" IS NULL)
    OR
    ("calculation" = 'RATIO' AND "numeratorMetricCode" IS NOT NULL AND "denominatorMetricCode" IS NOT NULL AND "multiplier" IS NOT NULL AND "multiplier" > 0)
  )
);

CREATE TABLE "MarketingDailyReport" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "sourceId" TEXT NOT NULL,
  "productId" TEXT,
  "ownerMembershipId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "marketCode" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "note" TEXT,
  "status" "MarketingReportStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "reviewedByMembershipId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "returnReason" TEXT,
  "lockedByMembershipId" TEXT,
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingDailyReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingDailyMetricValue" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "metricDefinitionId" TEXT NOT NULL,
  "valueCents" BIGINT,
  "valueDecimal" DECIMAL(22,6),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingDailyMetricValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingDailyMetricValue_one_value_check" CHECK (
    ("valueCents" IS NOT NULL AND "valueDecimal" IS NULL AND "valueCents" >= 0)
    OR
    ("valueCents" IS NULL AND "valueDecimal" IS NOT NULL AND "valueDecimal" >= 0)
  )
);

CREATE TABLE "MarketingKpiTarget" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "targetMembershipId" TEXT,
  "metricDefinitionId" TEXT NOT NULL,
  "scopeType" "MarketingKpiScopeType" NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "targetCents" BIGINT,
  "targetDecimal" DECIMAL(22,6),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "note" TEXT,
  "setByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingKpiTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingKpiTarget_one_value_check" CHECK (
    ("targetCents" IS NOT NULL AND "targetDecimal" IS NULL AND "targetCents" >= 0)
    OR
    ("targetCents" IS NULL AND "targetDecimal" IS NOT NULL AND "targetDecimal" >= 0)
  ),
  CONSTRAINT "MarketingKpiTarget_period_check" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "MarketingKpiTarget_scope_check" CHECK (
    ("scopeType" = 'BUSINESS_UNIT' AND "departmentId" IS NULL AND "targetMembershipId" IS NULL AND "scopeKey" = "businessUnitId")
    OR
    ("scopeType" = 'DEPARTMENT' AND "departmentId" IS NOT NULL AND "targetMembershipId" IS NULL AND "scopeKey" = "departmentId")
    OR
    ("scopeType" = 'MEMBERSHIP' AND "targetMembershipId" IS NOT NULL AND "scopeKey" = "targetMembershipId")
  )
);

CREATE TABLE "MarketingCreativeStatus" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCreativeStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingTag" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCreative" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "sourceId" TEXT,
  "productId" TEXT,
  "statusId" TEXT NOT NULL,
  "ownerMembershipId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "marketCode" TEXT,
  "languageCode" TEXT,
  "description" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "retiredReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCreativeAttachment" (
  "id" TEXT NOT NULL,
  "creativeId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "purpose" "MarketingCreativeAssetPurpose" NOT NULL DEFAULT 'PRIMARY',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCreativeAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCreativeTag" (
  "creativeId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCreativeTag_pkey" PRIMARY KEY ("creativeId", "tagId")
);

CREATE TABLE "MarketingCreativeMetricValue" (
  "id" TEXT NOT NULL,
  "creativeId" TEXT NOT NULL,
  "metricDefinitionId" TEXT NOT NULL,
  "recordedOn" DATE NOT NULL,
  "valueCents" BIGINT,
  "valueDecimal" DECIMAL(22,6),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCreativeMetricValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingCreativeMetricValue_one_value_check" CHECK (
    ("valueCents" IS NOT NULL AND "valueDecimal" IS NULL AND "valueCents" >= 0)
    OR
    ("valueCents" IS NULL AND "valueDecimal" IS NOT NULL AND "valueDecimal" >= 0)
  )
);

CREATE UNIQUE INDEX "MarketingSource_businessUnitId_code_key" ON "MarketingSource"("businessUnitId", "code");
CREATE UNIQUE INDEX "MarketingWorkbenchSetting_businessUnitId_key" ON "MarketingWorkbenchSetting"("businessUnitId");
CREATE INDEX "MarketingSource_businessUnitId_parentId_isActive_sortOrder_idx" ON "MarketingSource"("businessUnitId", "parentId", "isActive", "sortOrder");
CREATE INDEX "MarketingSource_departmentId_siteId_idx" ON "MarketingSource"("departmentId", "siteId");
CREATE UNIQUE INDEX "MarketingMetricDefinition_businessUnitId_code_key" ON "MarketingMetricDefinition"("businessUnitId", "code");
CREATE INDEX "MarketingMetricDefinition_businessUnitId_isActive_sortOrder_idx" ON "MarketingMetricDefinition"("businessUnitId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "MarketingDailyReport_businessUnitId_ownerMembershipId_sourceId_reportDate_key" ON "MarketingDailyReport"("businessUnitId", "ownerMembershipId", "sourceId", "reportDate");
CREATE INDEX "MarketingDailyReport_businessUnitId_reportDate_status_idx" ON "MarketingDailyReport"("businessUnitId", "reportDate", "status");
CREATE INDEX "MarketingDailyReport_businessUnitId_departmentId_reportDate_idx" ON "MarketingDailyReport"("businessUnitId", "departmentId", "reportDate");
CREATE INDEX "MarketingDailyReport_ownerMembershipId_reportDate_idx" ON "MarketingDailyReport"("ownerMembershipId", "reportDate");
CREATE INDEX "MarketingDailyReport_sourceId_reportDate_idx" ON "MarketingDailyReport"("sourceId", "reportDate");
CREATE UNIQUE INDEX "MarketingDailyMetricValue_reportId_metricDefinitionId_key" ON "MarketingDailyMetricValue"("reportId", "metricDefinitionId");
CREATE INDEX "MarketingDailyMetricValue_metricDefinitionId_idx" ON "MarketingDailyMetricValue"("metricDefinitionId");
CREATE UNIQUE INDEX "MarketingKpiTarget_businessUnitId_metricDefinitionId_scopeType_scopeKey_periodStart_periodEnd_key" ON "MarketingKpiTarget"("businessUnitId", "metricDefinitionId", "scopeType", "scopeKey", "periodStart", "periodEnd");
CREATE INDEX "MarketingKpiTarget_businessUnitId_periodStart_periodEnd_idx" ON "MarketingKpiTarget"("businessUnitId", "periodStart", "periodEnd");
CREATE INDEX "MarketingKpiTarget_departmentId_periodStart_periodEnd_idx" ON "MarketingKpiTarget"("departmentId", "periodStart", "periodEnd");
CREATE INDEX "MarketingKpiTarget_targetMembershipId_periodStart_periodEnd_idx" ON "MarketingKpiTarget"("targetMembershipId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "MarketingCreativeStatus_businessUnitId_code_key" ON "MarketingCreativeStatus"("businessUnitId", "code");
CREATE INDEX "MarketingCreativeStatus_businessUnitId_isActive_sortOrder_idx" ON "MarketingCreativeStatus"("businessUnitId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "MarketingTag_businessUnitId_name_key" ON "MarketingTag"("businessUnitId", "name");
CREATE INDEX "MarketingTag_businessUnitId_isActive_sortOrder_idx" ON "MarketingTag"("businessUnitId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "MarketingCreative_businessUnitId_code_key" ON "MarketingCreative"("businessUnitId", "code");
CREATE INDEX "MarketingCreative_businessUnitId_statusId_isArchived_updatedAt_idx" ON "MarketingCreative"("businessUnitId", "statusId", "isArchived", "updatedAt");
CREATE INDEX "MarketingCreative_businessUnitId_departmentId_ownerMembershipId_idx" ON "MarketingCreative"("businessUnitId", "departmentId", "ownerMembershipId");
CREATE INDEX "MarketingCreative_sourceId_productId_idx" ON "MarketingCreative"("sourceId", "productId");
CREATE UNIQUE INDEX "MarketingCreativeAttachment_creativeId_attachmentId_key" ON "MarketingCreativeAttachment"("creativeId", "attachmentId");
CREATE INDEX "MarketingCreativeAttachment_attachmentId_idx" ON "MarketingCreativeAttachment"("attachmentId");
CREATE INDEX "MarketingCreativeAttachment_creativeId_purpose_sortOrder_idx" ON "MarketingCreativeAttachment"("creativeId", "purpose", "sortOrder");
CREATE INDEX "MarketingCreativeTag_tagId_idx" ON "MarketingCreativeTag"("tagId");
CREATE UNIQUE INDEX "MarketingCreativeMetricValue_creativeId_metricDefinitionId_recordedOn_key" ON "MarketingCreativeMetricValue"("creativeId", "metricDefinitionId", "recordedOn");
CREATE INDEX "MarketingCreativeMetricValue_metricDefinitionId_recordedOn_idx" ON "MarketingCreativeMetricValue"("metricDefinitionId", "recordedOn");

ALTER TABLE "MarketingSource" ADD CONSTRAINT "MarketingSource_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingWorkbenchSetting" ADD CONSTRAINT "MarketingWorkbenchSetting_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingWorkbenchSetting" ADD CONSTRAINT "MarketingWorkbenchSetting_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingWorkbenchSetting" ADD CONSTRAINT "MarketingWorkbenchSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingSource" ADD CONSTRAINT "MarketingSource_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingSource" ADD CONSTRAINT "MarketingSource_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingSource" ADD CONSTRAINT "MarketingSource_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingSource" ADD CONSTRAINT "MarketingSource_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MarketingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingMetricDefinition" ADD CONSTRAINT "MarketingMetricDefinition_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingMetricDefinition" ADD CONSTRAINT "MarketingMetricDefinition_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyReport" ADD CONSTRAINT "MarketingDailyReport_lockedByMembershipId_fkey" FOREIGN KEY ("lockedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyMetricValue" ADD CONSTRAINT "MarketingDailyMetricValue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketingDailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDailyMetricValue" ADD CONSTRAINT "MarketingDailyMetricValue_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MarketingMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_targetMembershipId_fkey" FOREIGN KEY ("targetMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MarketingMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingKpiTarget" ADD CONSTRAINT "MarketingKpiTarget_setByMembershipId_fkey" FOREIGN KEY ("setByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeStatus" ADD CONSTRAINT "MarketingCreativeStatus_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeStatus" ADD CONSTRAINT "MarketingCreativeStatus_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingTag" ADD CONSTRAINT "MarketingTag_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingTag" ADD CONSTRAINT "MarketingTag_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "MarketingCreativeStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeAttachment" ADD CONSTRAINT "MarketingCreativeAttachment_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "MarketingCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeAttachment" ADD CONSTRAINT "MarketingCreativeAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeTag" ADD CONSTRAINT "MarketingCreativeTag_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "MarketingCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeTag" ADD CONSTRAINT "MarketingCreativeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "MarketingTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeMetricValue" ADD CONSTRAINT "MarketingCreativeMetricValue_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "MarketingCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCreativeMetricValue" ADD CONSTRAINT "MarketingCreativeMetricValue_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MarketingMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
