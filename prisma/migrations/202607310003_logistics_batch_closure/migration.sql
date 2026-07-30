-- Configurable logistics-provider export and return-import batches.
-- This migration only adds V2-local structures. It does not read, alter, or
-- import any legacy/production data.

CREATE TYPE "LogisticsExportBatchStatus" AS ENUM (
  'EXPORTED',
  'SENT_TO_PROVIDER',
  'RETURN_PREVIEWED',
  'RETURN_IMPORTED',
  'CANCELLED'
);

CREATE TYPE "LogisticsReturnImportBatchStatus" AS ENUM (
  'PREVIEWED',
  'IMPORTED',
  'CANCELLED'
);

CREATE TYPE "LogisticsReturnImportRowStatus" AS ENUM (
  'READY',
  'WARNING',
  'REJECTED',
  'IMPORTED'
);

CREATE TYPE "LogisticsBatchArtifactKind" AS ENUM (
  'EXPORT_WORKBOOK',
  'RETURN_WORKBOOK'
);

ALTER TABLE "LogisticsProviderTemplate"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "LogisticsExportBatch" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "templateId" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "batchNo" TEXT NOT NULL,
  "templateSnapshot" JSONB NOT NULL,
  "orderCount" INTEGER NOT NULL,
  "status" "LogisticsExportBatchStatus" NOT NULL DEFAULT 'EXPORTED',
  "dispatchNote" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "createdByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsExportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticsExportBatchItem" (
  "id" TEXT NOT NULL,
  "exportBatchId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNoSnapshot" TEXT NOT NULL,
  "rowHash" TEXT NOT NULL,
  "payloadSnapshot" JSONB NOT NULL,
  "trackingNo" TEXT,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsExportBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticsReturnImportBatch" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "exportBatchId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "mappingSnapshot" JSONB NOT NULL,
  "totalRows" INTEGER NOT NULL,
  "readyRows" INTEGER NOT NULL,
  "warningRows" INTEGER NOT NULL,
  "rejectedRows" INTEGER NOT NULL,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "status" "LogisticsReturnImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  "previewedByMembershipId" TEXT NOT NULL,
  "previewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsReturnImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticsReturnImportRow" (
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "orderNo" TEXT NOT NULL,
  "trackingNo" TEXT NOT NULL,
  "carrier" TEXT,
  "providerStatus" TEXT,
  "sourceRowHash" TEXT NOT NULL,
  "orderId" TEXT,
  "shipmentId" TEXT,
  "status" "LogisticsReturnImportRowStatus" NOT NULL,
  "message" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsReturnImportRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticsBatchArtifact" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "exportBatchId" TEXT,
  "returnImportBatchId" TEXT,
  "kind" "LogisticsBatchArtifactKind" NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LogisticsBatchArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsBatchArtifact_exactly_one_parent"
    CHECK (("exportBatchId" IS NULL) <> ("returnImportBatchId" IS NULL))
);

CREATE UNIQUE INDEX "LogisticsExportBatch_businessUnitId_batchNo_key"
ON "LogisticsExportBatch"("businessUnitId", "batchNo");
CREATE INDEX "LogisticsExportBatch_businessUnitId_status_createdAt_idx"
ON "LogisticsExportBatch"("businessUnitId", "status", "createdAt");
CREATE INDEX "LogisticsExportBatch_departmentId_createdAt_idx"
ON "LogisticsExportBatch"("departmentId", "createdAt");
CREATE INDEX "LogisticsExportBatch_createdByMembershipId_createdAt_idx"
ON "LogisticsExportBatch"("createdByMembershipId", "createdAt");

CREATE UNIQUE INDEX "LogisticsExportBatchItem_exportBatchId_orderId_key"
ON "LogisticsExportBatchItem"("exportBatchId", "orderId");
CREATE INDEX "LogisticsExportBatchItem_orderId_idx"
ON "LogisticsExportBatchItem"("orderId");
CREATE INDEX "LogisticsExportBatchItem_exportBatchId_orderNoSnapshot_idx"
ON "LogisticsExportBatchItem"("exportBatchId", "orderNoSnapshot");

CREATE INDEX "LogisticsReturnImportBatch_businessUnitId_status_previewedAt_idx"
ON "LogisticsReturnImportBatch"("businessUnitId", "status", "previewedAt");
CREATE INDEX "LogisticsReturnImportBatch_exportBatchId_status_idx"
ON "LogisticsReturnImportBatch"("exportBatchId", "status");
CREATE INDEX "LogisticsReturnImportBatch_sha256_idx"
ON "LogisticsReturnImportBatch"("sha256");
CREATE UNIQUE INDEX "LogisticsReturnImportBatch_exportBatchId_sha256_key"
ON "LogisticsReturnImportBatch"("exportBatchId", "sha256");

CREATE UNIQUE INDEX "LogisticsReturnImportRow_importBatchId_rowNumber_key"
ON "LogisticsReturnImportRow"("importBatchId", "rowNumber");
CREATE INDEX "LogisticsReturnImportRow_importBatchId_status_idx"
ON "LogisticsReturnImportRow"("importBatchId", "status");
CREATE INDEX "LogisticsReturnImportRow_orderId_idx"
ON "LogisticsReturnImportRow"("orderId");
CREATE INDEX "LogisticsReturnImportRow_shipmentId_idx"
ON "LogisticsReturnImportRow"("shipmentId");

CREATE INDEX "LogisticsBatchArtifact_businessUnitId_createdAt_idx"
ON "LogisticsBatchArtifact"("businessUnitId", "createdAt");
CREATE INDEX "LogisticsBatchArtifact_exportBatchId_idx"
ON "LogisticsBatchArtifact"("exportBatchId");
CREATE INDEX "LogisticsBatchArtifact_returnImportBatchId_idx"
ON "LogisticsBatchArtifact"("returnImportBatchId");
CREATE UNIQUE INDEX "LogisticsBatchArtifact_businessUnitId_storageKey_key"
ON "LogisticsBatchArtifact"("businessUnitId", "storageKey");

ALTER TABLE "LogisticsExportBatch"
  ADD CONSTRAINT "LogisticsExportBatch_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsExportBatch_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsExportBatch_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsExportBatch_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "LogisticsProviderTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsExportBatch_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticsExportBatchItem"
  ADD CONSTRAINT "LogisticsExportBatchItem_exportBatchId_fkey"
  FOREIGN KEY ("exportBatchId") REFERENCES "LogisticsExportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsExportBatchItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticsReturnImportBatch"
  ADD CONSTRAINT "LogisticsReturnImportBatch_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsReturnImportBatch_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsReturnImportBatch_exportBatchId_fkey"
  FOREIGN KEY ("exportBatchId") REFERENCES "LogisticsExportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsReturnImportBatch_previewedByMembershipId_fkey"
  FOREIGN KEY ("previewedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticsReturnImportRow"
  ADD CONSTRAINT "LogisticsReturnImportRow_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "LogisticsReturnImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticsBatchArtifact"
  ADD CONSTRAINT "LogisticsBatchArtifact_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsBatchArtifact_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsBatchArtifact_exportBatchId_fkey"
  FOREIGN KEY ("exportBatchId") REFERENCES "LogisticsExportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsBatchArtifact_returnImportBatchId_fkey"
  FOREIGN KEY ("returnImportBatchId") REFERENCES "LogisticsReturnImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticsBatchArtifact_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The new actions are database data, not role-name checks. Existing configured
-- grants are copied from their closest predecessor so no working role silently
-- loses access; administrators can refine each action independently afterwards.
INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('logistics.export_batch.read'), 'logistics.export_batch.read', '查看物流导出批次', '查看已创建的物流商导出批次及回传状态', 'erp', CURRENT_TIMESTAMP),
  (md5('logistics.export_batch.create'), 'logistics.export_batch.create', '创建物流导出批次', '选择待发货订单并生成物流商导出批次', 'erp', CURRENT_TIMESTAMP),
  (md5('logistics.export_batch.dispatch'), 'logistics.export_batch.dispatch', '标记物流商已接收', '记录批次已人工发送给物流商', 'erp', CURRENT_TIMESTAMP),
  (md5('logistics.return_import.preview'), 'logistics.return_import.preview', '预检物流商回传文件', '上传物流商回传文件并生成逐行预检', 'erp', CURRENT_TIMESTAMP),
  (md5('logistics.return_import.confirm'), 'logistics.return_import.confirm', '确认物流商回传', '确认预检通过的物流单号回填', 'erp', CURRENT_TIMESTAMP),
  (md5('logistics.batch_artifact.read'), 'logistics.batch_artifact.read', '下载物流批次原文件', '下载受权限保护的导出或回传原始表格', 'erp', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.export_batch.read'), rp."roleId", 'logistics.export_batch.read', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" = 'logistics_template.read'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.export_batch.create'), rp."roleId", 'logistics.export_batch.create', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" = 'logistics_template.export'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.export_batch.dispatch'), rp."roleId", 'logistics.export_batch.dispatch', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" = 'logistics_template.export'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.return_import.preview'), rp."roleId", 'logistics.return_import.preview', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" = 'shipment.create'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.return_import.confirm'), rp."roleId", 'logistics.return_import.confirm', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" = 'shipment.create'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT md5(rp."roleId" || ':logistics.batch_artifact.read'), rp."roleId", 'logistics.batch_artifact.read', rp."scope", rp."isAllowed", rp."conditions", CURRENT_TIMESTAMP
FROM "RolePermission" rp
WHERE rp."actionKey" IN ('logistics_template.read', 'shipment.create')
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.export_batch.read'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.export_batch.read', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" = 'logistics_template.read'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.export_batch.create'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.export_batch.create', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" = 'logistics_template.export'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.export_batch.dispatch'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.export_batch.dispatch', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" = 'logistics_template.export'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.return_import.preview'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.return_import.preview', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" = 'shipment.create'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.return_import.confirm'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.return_import.confirm', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" = 'shipment.create'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessGrant" ("id", "granteeMembershipId", "granterMembershipId", "actionKey", "scope", "reason", "businessUnitId", "departmentId", "siteId", "grantedAt", "expiresAt", "revokedAt", "isActive")
SELECT md5(ag."id" || ':logistics.batch_artifact.read'), ag."granteeMembershipId", ag."granterMembershipId", 'logistics.batch_artifact.read', ag."scope", ag."reason", ag."businessUnitId", ag."departmentId", ag."siteId", ag."grantedAt", ag."expiresAt", ag."revokedAt", ag."isActive"
FROM "AccessGrant" ag WHERE ag."actionKey" IN ('logistics_template.read', 'shipment.create')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.export_batch.read'), dr."roleId", 'logistics.export_batch.read', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" = 'logistics_template.read'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.export_batch.create'), dr."roleId", 'logistics.export_batch.create', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" = 'logistics_template.export'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.export_batch.dispatch'), dr."roleId", 'logistics.export_batch.dispatch', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" = 'logistics_template.export'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.return_import.preview'), dr."roleId", 'logistics.return_import.preview', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" = 'shipment.create'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.batch_artifact.read'), dr."roleId", 'logistics.batch_artifact.read', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" IN ('logistics_template.read', 'shipment.create')
ON CONFLICT ("roleId", "actionKey") DO NOTHING;

INSERT INTO "DelegationRule" ("id", "roleId", "actionKey", "canTransfer", "maxScope", "updatedAt")
SELECT md5(dr."roleId" || ':logistics.return_import.confirm'), dr."roleId", 'logistics.return_import.confirm', dr."canTransfer", dr."maxScope", CURRENT_TIMESTAMP
FROM "DelegationRule" dr WHERE dr."actionKey" = 'shipment.create'
ON CONFLICT ("roleId", "actionKey") DO NOTHING;
