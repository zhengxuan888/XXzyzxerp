CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'DEAD');

ALTER TABLE "LogisticsWorkbenchSetting"
ADD COLUMN "feishuNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "feishuHighPriorityOnly" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "shipmentEventId" TEXT,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON "NotificationDelivery"("dedupeKey");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_businessUnitId_channel_status_idx" ON "NotificationDelivery"("businessUnitId", "channel", "status");
CREATE INDEX "NotificationDelivery_shipmentId_createdAt_idx" ON "NotificationDelivery"("shipmentId", "createdAt");

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_businessUnitId_fkey"
FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_shipmentEventId_fkey"
FOREIGN KEY ("shipmentEventId") REFERENCES "ShipmentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
