CREATE TABLE "LogisticsProviderTemplate" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsProviderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticsProviderTemplate_businessUnitId_code_key"
ON "LogisticsProviderTemplate"("businessUnitId", "code");

CREATE INDEX "LogisticsProviderTemplate_businessUnitId_isActive_idx"
ON "LogisticsProviderTemplate"("businessUnitId", "isActive");

ALTER TABLE "LogisticsProviderTemplate"
ADD CONSTRAINT "LogisticsProviderTemplate_legalEntityId_fkey"
FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticsProviderTemplate"
ADD CONSTRAINT "LogisticsProviderTemplate_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
