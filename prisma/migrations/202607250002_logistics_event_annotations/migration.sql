CREATE TABLE "LogisticsEventAnnotation" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "shipmentEventId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isHandled" BOOLEAN NOT NULL DEFAULT false,
    "handledAt" TIMESTAMP(3),
    "handledByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsEventAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticsEventAnnotation_shipmentEventId_key" ON "LogisticsEventAnnotation"("shipmentEventId");
CREATE INDEX "LogisticsEventAnnotation_businessUnitId_isHandled_updatedAt_idx" ON "LogisticsEventAnnotation"("businessUnitId", "isHandled", "updatedAt");
CREATE INDEX "LogisticsEventAnnotation_shipmentId_updatedAt_idx" ON "LogisticsEventAnnotation"("shipmentId", "updatedAt");

ALTER TABLE "LogisticsEventAnnotation" ADD CONSTRAINT "LogisticsEventAnnotation_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsEventAnnotation" ADD CONSTRAINT "LogisticsEventAnnotation_shipmentEventId_fkey"
FOREIGN KEY ("shipmentEventId") REFERENCES "ShipmentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsEventAnnotation" ADD CONSTRAINT "LogisticsEventAnnotation_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsEventAnnotation" ADD CONSTRAINT "LogisticsEventAnnotation_handledByMembershipId_fkey"
FOREIGN KEY ("handledByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
