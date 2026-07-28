CREATE TABLE "DailyGoal" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "goalDate" DATE NOT NULL,
    "targetOrderCount" INTEGER NOT NULL DEFAULT 0,
    "targetAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "setByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyGoal_businessUnitId_membershipId_goalDate_key"
ON "DailyGoal"("businessUnitId", "membershipId", "goalDate");

CREATE INDEX "DailyGoal_businessUnitId_goalDate_idx"
ON "DailyGoal"("businessUnitId", "goalDate");

CREATE INDEX "DailyGoal_membershipId_goalDate_idx"
ON "DailyGoal"("membershipId", "goalDate");

ALTER TABLE "DailyGoal"
ADD CONSTRAINT "DailyGoal_legalEntityId_fkey"
FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyGoal"
ADD CONSTRAINT "DailyGoal_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyGoal"
ADD CONSTRAINT "DailyGoal_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyGoal"
ADD CONSTRAINT "DailyGoal_setByMembershipId_fkey"
FOREIGN KEY ("setByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
