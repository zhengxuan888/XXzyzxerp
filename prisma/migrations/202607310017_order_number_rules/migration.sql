-- Database-driven order numbering. Existing orders retain their current
-- numbers; new orders are assigned by a scoped rule and an atomic counter.

ALTER TABLE "Order" ADD COLUMN "orderNumberRuleId" TEXT;

CREATE TABLE "OrderNumberRule" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "orderTemplateId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYYMMDD',
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "includeDepartmentCode" BOOLEAN NOT NULL DEFAULT false,
    "separator" TEXT NOT NULL DEFAULT '-',
    "sequencePadding" INTEGER NOT NULL DEFAULT 1,
    "resetPeriod" TEXT NOT NULL DEFAULT 'DAILY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumberRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderNumberCounter" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderNumberRule_businessUnitId_code_key" ON "OrderNumberRule"("businessUnitId", "code");
CREATE INDEX "OrderNumberRule_businessUnitId_isActive_priority_idx" ON "OrderNumberRule"("businessUnitId", "isActive", "priority");
CREATE INDEX "OrderNumberRule_businessUnitId_departmentId_orderTemplateId_idx" ON "OrderNumberRule"("businessUnitId", "departmentId", "orderTemplateId");
CREATE UNIQUE INDEX "OrderNumberRule_default_per_business_unit" ON "OrderNumberRule"("businessUnitId") WHERE "isDefault" = true;
CREATE UNIQUE INDEX "OrderNumberCounter_ruleId_periodKey_scopeKey_key" ON "OrderNumberCounter"("ruleId", "periodKey", "scopeKey");
CREATE INDEX "OrderNumberCounter_ruleId_updatedAt_idx" ON "OrderNumberCounter"("ruleId", "updatedAt");
CREATE INDEX "Order_orderNumberRuleId_idx" ON "Order"("orderNumberRuleId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_orderNumberRuleId_fkey"
  FOREIGN KEY ("orderNumberRuleId") REFERENCES "OrderNumberRule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderNumberRule" ADD CONSTRAINT "OrderNumberRule_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderNumberRule" ADD CONSTRAINT "OrderNumberRule_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderNumberRule" ADD CONSTRAINT "OrderNumberRule_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderNumberRule" ADD CONSTRAINT "OrderNumberRule_orderTemplateId_fkey"
  FOREIGN KEY ("orderTemplateId") REFERENCES "OrderTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderNumberCounter" ADD CONSTRAINT "OrderNumberCounter_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "OrderNumberRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
