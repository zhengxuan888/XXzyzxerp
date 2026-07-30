-- Finance settlement foundation for V2 only.
-- It intentionally does not read legacy data, copy role permissions, or grant
-- existing users access. Financial actions remain fail-closed until an
-- authorized administrator configures them in the role-permission UI.

CREATE TYPE "FinanceCounterpartyType" AS ENUM (
  'LOGISTICS_PROVIDER',
  'WAREHOUSE_PROVIDER',
  'SERVICE_PROVIDER',
  'OTHER'
);

CREATE TYPE "FinanceStatementType" AS ENUM (
  'COD_REMITTANCE',
  'SHIPPING_FEE',
  'WAREHOUSE_FEE',
  'RETURN_FEE',
  'OTHER'
);

CREATE TYPE "FinanceStatementStatus" AS ENUM (
  'DRAFT',
  'RECONCILING',
  'EXCEPTION',
  'APPROVED',
  'POSTED',
  'VOIDED'
);

CREATE TYPE "FinanceLineReconciliationStatus" AS ENUM (
  'UNMATCHED',
  'SUGGESTED',
  'MATCHED',
  'AMOUNT_MISMATCH',
  'IGNORED'
);

CREATE TYPE "FinanceReconciliationStatus" AS ENUM (
  'SUGGESTED',
  'CONFIRMED',
  'REJECTED',
  'IGNORED'
);

CREATE TYPE "FinanceMatchMethod" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "FinancePaymentDirection" AS ENUM ('PAYABLE', 'RECEIVABLE');
CREATE TYPE "FinancePaymentStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'VOIDED');

CREATE TABLE "FinanceCounterparty" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinanceCounterpartyType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCounterparty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceStatement" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "counterpartyId" TEXT NOT NULL,
  "statementNo" TEXT NOT NULL,
  "type" "FinanceStatementType" NOT NULL,
  "status" "FinanceStatementStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL,
  "currencyScale" INTEGER NOT NULL DEFAULT 2,
  "totalAmountCents" BIGINT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "note" TEXT,
  "exceptionReason" TEXT,
  "createdByMembershipId" TEXT NOT NULL,
  "approvedByMembershipId" TEXT,
  "postedByMembershipId" TEXT,
  "voidedByMembershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatement_amount_positive" CHECK ("totalAmountCents" > 0),
  CONSTRAINT "FinanceStatement_currency_scale" CHECK ("currencyScale" BETWEEN 0 AND 6),
  CONSTRAINT "FinanceStatement_period_order" CHECK ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd")
);

CREATE TABLE "FinanceStatementLine" (
  "id" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "orderId" TEXT,
  "shipmentId" TEXT,
  "sourceReference" TEXT,
  "description" TEXT,
  "currency" TEXT NOT NULL,
  "currencyScale" INTEGER NOT NULL DEFAULT 2,
  "amountCents" BIGINT NOT NULL,
  "reconciliationStatus" "FinanceLineReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
  "exceptionReason" TEXT,
  "sourceSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStatementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatementLine_amount_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "FinanceStatementLine_currency_scale" CHECK ("currencyScale" BETWEEN 0 AND 6),
  CONSTRAINT "FinanceStatementLine_single_business_reference" CHECK (("orderId" IS NULL) OR ("shipmentId" IS NULL))
);

CREATE TABLE "FinanceReconciliation" (
  "id" TEXT NOT NULL,
  "statementLineId" TEXT NOT NULL,
  "orderId" TEXT,
  "shipmentId" TEXT,
  "amountCents" BIGINT NOT NULL,
  "status" "FinanceReconciliationStatus" NOT NULL DEFAULT 'SUGGESTED',
  "method" "FinanceMatchMethod" NOT NULL DEFAULT 'MANUAL',
  "reason" TEXT,
  "createdByMembershipId" TEXT NOT NULL,
  "confirmedByMembershipId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReconciliation_amount_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "FinanceReconciliation_exactly_one_business_reference" CHECK (("orderId" IS NULL) <> ("shipmentId" IS NULL))
);

CREATE TABLE "FinancePayment" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "departmentId" TEXT,
  "siteId" TEXT,
  "counterpartyId" TEXT NOT NULL,
  "paymentNo" TEXT NOT NULL,
  "direction" "FinancePaymentDirection" NOT NULL,
  "status" "FinancePaymentStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL,
  "currencyScale" INTEGER NOT NULL DEFAULT 2,
  "amountCents" BIGINT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "note" TEXT,
  "voidReason" TEXT,
  "createdByMembershipId" TEXT NOT NULL,
  "approvedByMembershipId" TEXT,
  "postedByMembershipId" TEXT,
  "voidedByMembershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePayment_amount_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "FinancePayment_currency_scale" CHECK ("currencyScale" BETWEEN 0 AND 6)
);

CREATE TABLE "FinancePaymentAllocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "createdByMembershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePaymentAllocation_amount_positive" CHECK ("amountCents" > 0)
);

CREATE UNIQUE INDEX "FinanceCounterparty_businessUnitId_code_key" ON "FinanceCounterparty"("businessUnitId", "code");
CREATE INDEX "FinanceCounterparty_businessUnitId_isActive_name_idx" ON "FinanceCounterparty"("businessUnitId", "isActive", "name");
CREATE INDEX "FinanceCounterparty_departmentId_isActive_idx" ON "FinanceCounterparty"("departmentId", "isActive");
CREATE INDEX "FinanceCounterparty_createdByMembershipId_createdAt_idx" ON "FinanceCounterparty"("createdByMembershipId", "createdAt");

CREATE UNIQUE INDEX "FinanceStatement_businessUnitId_counterpartyId_statementNo_key" ON "FinanceStatement"("businessUnitId", "counterpartyId", "statementNo");
CREATE INDEX "FinanceStatement_businessUnitId_status_createdAt_id_idx" ON "FinanceStatement"("businessUnitId", "status", "createdAt", "id");
CREATE INDEX "FinanceStatement_businessUnitId_type_periodStart_periodEnd_idx" ON "FinanceStatement"("businessUnitId", "type", "periodStart", "periodEnd");
CREATE INDEX "FinanceStatement_departmentId_status_createdAt_idx" ON "FinanceStatement"("departmentId", "status", "createdAt");
CREATE INDEX "FinanceStatement_counterpartyId_status_idx" ON "FinanceStatement"("counterpartyId", "status");

CREATE UNIQUE INDEX "FinanceStatementLine_statementId_lineNo_key" ON "FinanceStatementLine"("statementId", "lineNo");
CREATE INDEX "FinanceStatementLine_statementId_reconciliationStatus_lineNo_idx" ON "FinanceStatementLine"("statementId", "reconciliationStatus", "lineNo");
CREATE INDEX "FinanceStatementLine_orderId_idx" ON "FinanceStatementLine"("orderId");
CREATE INDEX "FinanceStatementLine_shipmentId_idx" ON "FinanceStatementLine"("shipmentId");

CREATE UNIQUE INDEX "FinanceReconciliation_statementLineId_orderId_key" ON "FinanceReconciliation"("statementLineId", "orderId");
CREATE UNIQUE INDEX "FinanceReconciliation_statementLineId_shipmentId_key" ON "FinanceReconciliation"("statementLineId", "shipmentId");
CREATE INDEX "FinanceReconciliation_statementLineId_status_idx" ON "FinanceReconciliation"("statementLineId", "status");
CREATE INDEX "FinanceReconciliation_orderId_status_idx" ON "FinanceReconciliation"("orderId", "status");
CREATE INDEX "FinanceReconciliation_shipmentId_status_idx" ON "FinanceReconciliation"("shipmentId", "status");

CREATE UNIQUE INDEX "FinancePayment_businessUnitId_paymentNo_key" ON "FinancePayment"("businessUnitId", "paymentNo");
CREATE INDEX "FinancePayment_businessUnitId_status_createdAt_id_idx" ON "FinancePayment"("businessUnitId", "status", "createdAt", "id");
CREATE INDEX "FinancePayment_departmentId_status_createdAt_idx" ON "FinancePayment"("departmentId", "status", "createdAt");
CREATE INDEX "FinancePayment_counterpartyId_status_idx" ON "FinancePayment"("counterpartyId", "status");

CREATE UNIQUE INDEX "FinancePaymentAllocation_paymentId_statementId_key" ON "FinancePaymentAllocation"("paymentId", "statementId");
CREATE INDEX "FinancePaymentAllocation_statementId_createdAt_idx" ON "FinancePaymentAllocation"("statementId", "createdAt");
CREATE INDEX "FinancePaymentAllocation_createdByMembershipId_createdAt_idx" ON "FinancePaymentAllocation"("createdByMembershipId", "createdAt");

ALTER TABLE "FinanceCounterparty"
  ADD CONSTRAINT "FinanceCounterparty_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCounterparty_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCounterparty_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCounterparty_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceStatement"
  ADD CONSTRAINT "FinanceStatement_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "FinanceCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_postedByMembershipId_fkey" FOREIGN KEY ("postedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatement_voidedByMembershipId_fkey" FOREIGN KEY ("voidedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementLine"
  ADD CONSTRAINT "FinanceStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FinanceStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceStatementLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceReconciliation"
  ADD CONSTRAINT "FinanceReconciliation_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "FinanceStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReconciliation_confirmedByMembershipId_fkey" FOREIGN KEY ("confirmedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePayment"
  ADD CONSTRAINT "FinancePayment_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "FinanceCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_postedByMembershipId_fkey" FOREIGN KEY ("postedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePayment_voidedByMembershipId_fkey" FOREIGN KEY ("voidedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancePaymentAllocation"
  ADD CONSTRAINT "FinancePaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FinanceStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancePaymentAllocation_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Actions are stable system keys. Their role, menu and delegation mappings are
-- intentionally not copied from any predecessor action.
INSERT INTO "Action" ("id", "key", "name", "description", "namespace", "updatedAt") VALUES
  (md5('finance.counterparty.read'), 'finance.counterparty.read', '查看结算对象', '查看当前授权范围内的结算对象', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.counterparty.manage'), 'finance.counterparty.manage', '管理结算对象', '创建或维护当前授权范围内的结算对象', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement.read'), 'finance.statement.read', '查看物流商结算与COD回款', '查看当前授权范围内的结算单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement.create'), 'finance.statement.create', '创建结算单', '创建物流商账单或COD回款结算草稿', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.statement.update'), 'finance.statement.update', '编辑结算单草稿', '新增或编辑草稿结算单明细', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.reconciliation.read'), 'finance.reconciliation.read', '查看对账明细', '查看结算明细和匹配记录', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.reconciliation.match'), 'finance.reconciliation.match', '创建人工匹配建议', '将结算明细关联订单或运单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.reconciliation.resolve'), 'finance.reconciliation.resolve', '处理对账差异', '确认、拒绝或忽略匹配建议', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.settlement.approve'), 'finance.settlement.approve', '批准结算单', '批准已完成对账的结算单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.settlement.post'), 'finance.settlement.post', '结算单过账', '过账已批准结算单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.settlement.void'), 'finance.settlement.void', '作废结算单', '以审计原因作废结算单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.read'), 'finance.payment.read', '查看付款与核销', '查看当前授权范围内的付款记录', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.create'), 'finance.payment.create', '创建付款草稿', '创建付款或收款草稿', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.approve'), 'finance.payment.approve', '批准付款', '批准付款或收款草稿', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.post'), 'finance.payment.post', '付款过账', '过账已核销付款或收款记录', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.void'), 'finance.payment.void', '作废付款', '以审计原因作废付款或收款记录', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.payment.allocate'), 'finance.payment.allocate', '付款核销', '将付款分配给已批准结算单', 'finance', CURRENT_TIMESTAMP),
  (md5('finance.pii.read'), 'finance.pii.read', '查看财务敏感字段', '查看财务场景中额外受保护的隐私字段', 'finance', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- The default menu is only created when the finance group already exists. A
-- fresh environment receives the same definition through prisma/seed.ts.
INSERT INTO "Menu" ("id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive", "requiredActionKey", "requiredCondition", "updatedAt")
SELECT md5('finance-settlements'), 'finance-settlements', '物流回款与结算', '/admin/finance-settlements', 'Landmark', parent."id", 145, true, 'finance.statement.read', NULL, CURRENT_TIMESTAMP
FROM "Menu" parent
WHERE parent."key" = 'group-finance'
ON CONFLICT ("key") DO NOTHING;
