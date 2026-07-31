-- CreateTable
CREATE TABLE "ResourceCategory" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSoftware" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceStatus" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceLifecycleAction" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT,
    "availableQuantityDelta" INTEGER NOT NULL DEFAULT 0,
    "archiveAsset" BOOLEAN NOT NULL DEFAULT false,
    "requiresAssignee" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceLifecycleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAsset" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "siteId" TEXT,
    "categoryId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "resourceNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandModel" TEXT,
    "serialNumber" TEXT,
    "ownership" TEXT,
    "location" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "availableQuantity" INTEGER NOT NULL DEFAULT 1,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "valueCents" BIGINT,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "assignedMembershipId" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareAssetProfile" (
    "id" TEXT NOT NULL,
    "resourceAssetId" TEXT NOT NULL,
    "platform" TEXT,
    "accountIdentifier" TEXT,
    "licenseType" TEXT,
    "seatsTotal" INTEGER,
    "seatsUsed" INTEGER NOT NULL DEFAULT 0,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "renewalCostCents" BIGINT,
    "renewalCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "renewalCycle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareAssetProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceLifecycleEvent" (
    "id" TEXT NOT NULL,
    "resourceAssetId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "siteId" TEXT,
    "lifecycleActionId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT,
    "fromAssigneeMembershipId" TEXT,
    "toAssigneeMembershipId" TEXT,
    "availableQuantityBefore" INTEGER NOT NULL,
    "availableQuantityAfter" INTEGER NOT NULL,
    "note" TEXT,
    "performedByMembershipId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceCategory_businessUnitId_isActive_sortOrder_idx" ON "ResourceCategory"("businessUnitId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCategory_businessUnitId_code_key" ON "ResourceCategory"("businessUnitId", "code");

-- CreateIndex
CREATE INDEX "ResourceStatus_businessUnitId_isActive_sortOrder_idx" ON "ResourceStatus"("businessUnitId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceStatus_businessUnitId_code_key" ON "ResourceStatus"("businessUnitId", "code");

-- CreateIndex
CREATE INDEX "ResourceLifecycleAction_businessUnitId_isActive_sortOrder_idx" ON "ResourceLifecycleAction"("businessUnitId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ResourceLifecycleAction_fromStatusId_idx" ON "ResourceLifecycleAction"("fromStatusId");

-- CreateIndex
CREATE INDEX "ResourceLifecycleAction_toStatusId_idx" ON "ResourceLifecycleAction"("toStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceLifecycleAction_businessUnitId_code_key" ON "ResourceLifecycleAction"("businessUnitId", "code");

-- CreateIndex
CREATE INDEX "ResourceAsset_businessUnitId_isActive_updatedAt_id_idx" ON "ResourceAsset"("businessUnitId", "isActive", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "ResourceAsset_businessUnitId_categoryId_statusId_idx" ON "ResourceAsset"("businessUnitId", "categoryId", "statusId");

-- CreateIndex
CREATE INDEX "ResourceAsset_businessUnitId_departmentId_siteId_idx" ON "ResourceAsset"("businessUnitId", "departmentId", "siteId");

-- CreateIndex
CREATE INDEX "ResourceAsset_assignedMembershipId_isActive_idx" ON "ResourceAsset"("assignedMembershipId", "isActive");

-- CreateIndex
CREATE INDEX "ResourceAsset_expiresAt_idx" ON "ResourceAsset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAsset_businessUnitId_resourceNo_key" ON "ResourceAsset"("businessUnitId", "resourceNo");

-- CreateIndex
CREATE UNIQUE INDEX "SoftwareAssetProfile_resourceAssetId_key" ON "SoftwareAssetProfile"("resourceAssetId");

-- CreateIndex
CREATE INDEX "ResourceLifecycleEvent_resourceAssetId_occurredAt_id_idx" ON "ResourceLifecycleEvent"("resourceAssetId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "ResourceLifecycleEvent_businessUnitId_occurredAt_idx" ON "ResourceLifecycleEvent"("businessUnitId", "occurredAt");

-- CreateIndex
CREATE INDEX "ResourceLifecycleEvent_toAssigneeMembershipId_occurredAt_idx" ON "ResourceLifecycleEvent"("toAssigneeMembershipId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ResourceCategory" ADD CONSTRAINT "ResourceCategory_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCategory" ADD CONSTRAINT "ResourceCategory_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceStatus" ADD CONSTRAINT "ResourceStatus_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceStatus" ADD CONSTRAINT "ResourceStatus_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleAction" ADD CONSTRAINT "ResourceLifecycleAction_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleAction" ADD CONSTRAINT "ResourceLifecycleAction_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleAction" ADD CONSTRAINT "ResourceLifecycleAction_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "ResourceStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleAction" ADD CONSTRAINT "ResourceLifecycleAction_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "ResourceStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ResourceStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftwareAssetProfile" ADD CONSTRAINT "SoftwareAssetProfile_resourceAssetId_fkey" FOREIGN KEY ("resourceAssetId") REFERENCES "ResourceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_resourceAssetId_fkey" FOREIGN KEY ("resourceAssetId") REFERENCES "ResourceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_lifecycleActionId_fkey" FOREIGN KEY ("lifecycleActionId") REFERENCES "ResourceLifecycleAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "ResourceStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "ResourceStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_performedByMembershipId_fkey" FOREIGN KEY ("performedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_fromAssigneeMembershipId_fkey" FOREIGN KEY ("fromAssigneeMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLifecycleEvent" ADD CONSTRAINT "ResourceLifecycleEvent_toAssigneeMembershipId_fkey" FOREIGN KEY ("toAssigneeMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "FinancePaymentAllocationAdjustment_businessUnitId_status_reques" RENAME TO "FinancePaymentAllocationAdjustment_businessUnitId_status_re_idx";

-- RenameIndex
ALTER INDEX "FinancePaymentAllocationAdjustment_replacementStatementId_statu" RENAME TO "FinancePaymentAllocationAdjustment_replacementStatementId_s_idx";

-- RenameIndex
ALTER INDEX "FinancePaymentAllocationAdjustment_requestedByMembershipId_requ" RENAME TO "FinancePaymentAllocationAdjustment_requestedByMembershipId__idx";

-- RenameIndex
ALTER INDEX "FinancePaymentAllocationAdjustment_sourceAllocationId_idempoten" RENAME TO "FinancePaymentAllocationAdjustment_sourceAllocationId_idemp_key";

-- RenameIndex
ALTER INDEX "FinancePaymentAllocationEffect_appliedByMembershipId_appliedAt_" RENAME TO "FinancePaymentAllocationEffect_appliedByMembershipId_applie_idx";

-- RenameIndex
ALTER INDEX "FinanceReconciliation_businessUnitId_counterpartyId_statementTy" RENAME TO "FinanceReconciliation_businessUnitId_counterpartyId_stateme_idx";

-- RenameIndex
ALTER INDEX "FinanceStatementImportBatch_businessUnitId_status_cancelledAt_i" RENAME TO "FinanceStatementImportBatch_businessUnitId_status_cancelled_idx";

-- RenameIndex
ALTER INDEX "FinanceStatementImportBatch_businessUnitId_status_previewedAt_i" RENAME TO "FinanceStatementImportBatch_businessUnitId_status_previewed_idx";

-- RenameIndex
ALTER INDEX "FinanceStatementImportBatch_previewedByMembershipId_previewedAt" RENAME TO "FinanceStatementImportBatch_previewedByMembershipId_preview_idx";

-- RenameIndex
ALTER INDEX "FinanceStatementLine_statementId_reconciliationStatus_lineNo_id" RENAME TO "FinanceStatementLine_statementId_reconciliationStatus_lineN_idx";

-- RenameIndex
ALTER INDEX "LogisticsReturnImportBatch_businessUnitId_status_previewedAt_id" RENAME TO "LogisticsReturnImportBatch_businessUnitId_status_previewedA_idx";
