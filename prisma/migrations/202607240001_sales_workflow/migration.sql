-- CreateEnum
CREATE TYPE "LogisticsWorkStatus" AS ENUM ('MONITORING', 'NEEDS_ATTENTION', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_CARRIER', 'RESOLVED', 'NO_ACTION_REQUIRED', 'CLOSED');

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'PICKED_UP';
ALTER TYPE "ShipmentStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNING';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNED';
ALTER TYPE "ShipmentStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "closeReason" TEXT,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "estimatedDeliveryAt" TIMESTAMP(3),
ADD COLUMN "firstTrackedAt" TIMESTAMP(3),
ADD COLUMN "lastTrackedAt" TIMESTAMP(3),
ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN "ownerMembershipId" TEXT,
ADD COLUMN "workStatus" "LogisticsWorkStatus" NOT NULL DEFAULT 'MONITORING';

-- AlterTable
ALTER TABLE "ShipmentEvent" ADD COLUMN "externalEventKey" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "statusMilestone" TEXT;

-- CreateTable
CREATE TABLE "LogisticsFollowUp" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "fromStatus" "LogisticsWorkStatus",
    "toStatus" "LogisticsWorkStatus",
    "note" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogisticsFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticsFollowUp_shipmentId_createdAt_idx" ON "LogisticsFollowUp"("shipmentId", "createdAt");
CREATE INDEX "LogisticsFollowUp_businessUnitId_toStatus_createdAt_idx" ON "LogisticsFollowUp"("businessUnitId", "toStatus", "createdAt");
CREATE INDEX "Shipment_businessUnitId_workStatus_nextFollowUpAt_idx" ON "Shipment"("businessUnitId", "workStatus", "nextFollowUpAt");
CREATE INDEX "Shipment_ownerMembershipId_workStatus_idx" ON "Shipment"("ownerMembershipId", "workStatus");
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_source_externalEventKey_key" ON "ShipmentEvent"("shipmentId", "source", "externalEventKey");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LogisticsFollowUp" ADD CONSTRAINT "LogisticsFollowUp_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsFollowUp" ADD CONSTRAINT "LogisticsFollowUp_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsFollowUp" ADD CONSTRAINT "LogisticsFollowUp_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsFollowUp" ADD CONSTRAINT "LogisticsFollowUp_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
