CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationCredential_businessUnitId_providerKey_key"
ON "IntegrationCredential"("businessUnitId", "providerKey");

CREATE INDEX "IntegrationCredential_businessUnitId_isEnabled_idx"
ON "IntegrationCredential"("businessUnitId", "isEnabled");

ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
