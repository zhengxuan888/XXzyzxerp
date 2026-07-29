CREATE TABLE "LogisticsWorkbenchSetting" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "quickTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cards" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsWorkbenchSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticsWorkbenchSetting_businessUnitId_key"
ON "LogisticsWorkbenchSetting"("businessUnitId");

ALTER TABLE "LogisticsWorkbenchSetting"
ADD CONSTRAINT "LogisticsWorkbenchSetting_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
