-- Dashboard cards are stored per business unit. The JSON payload is validated
-- by the application and contains only known metric keys plus audience and
-- layout metadata; it never grants data access by itself.

CREATE TABLE "DashboardWorkbenchSetting" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "cards" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWorkbenchSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardWorkbenchSetting_businessUnitId_key"
ON "DashboardWorkbenchSetting"("businessUnitId");

ALTER TABLE "DashboardWorkbenchSetting"
ADD CONSTRAINT "DashboardWorkbenchSetting_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
