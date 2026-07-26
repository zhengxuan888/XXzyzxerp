ALTER TABLE "Membership" ADD COLUMN "managerMembershipId" TEXT;

CREATE INDEX "Membership_managerMembershipId_isActive_idx" ON "Membership"("managerMembershipId", "isActive");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_managerMembershipId_fkey"
  FOREIGN KEY ("managerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
