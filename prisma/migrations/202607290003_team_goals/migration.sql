CREATE TABLE "TeamGoal" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "scopeType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "goalDate" DATE NOT NULL,
    "targetOrderCount" INTEGER NOT NULL DEFAULT 0,
    "targetAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "setByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamGoal_businessUnitId_scopeKey_goalDate_key"
ON "TeamGoal"("businessUnitId", "scopeKey", "goalDate");

CREATE INDEX "TeamGoal_businessUnitId_goalDate_idx"
ON "TeamGoal"("businessUnitId", "goalDate");

CREATE INDEX "TeamGoal_departmentId_goalDate_idx"
ON "TeamGoal"("departmentId", "goalDate");

ALTER TABLE "TeamGoal"
ADD CONSTRAINT "TeamGoal_legalEntityId_fkey"
FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamGoal"
ADD CONSTRAINT "TeamGoal_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamGoal"
ADD CONSTRAINT "TeamGoal_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamGoal"
ADD CONSTRAINT "TeamGoal_setByMembershipId_fkey"
FOREIGN KEY ("setByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
