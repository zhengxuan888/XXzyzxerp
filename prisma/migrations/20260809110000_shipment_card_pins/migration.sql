-- Personal logistics-card pins are isolated by Membership. The migration is
-- intentionally safe to re-run during deployment recovery.
CREATE TABLE IF NOT EXISTS "ShipmentCardPin" (
  "id" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipmentCardPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentCardPin_membershipId_shipmentId_key"
  ON "ShipmentCardPin"("membershipId", "shipmentId");

CREATE INDEX IF NOT EXISTS "ShipmentCardPin_membershipId_pinnedAt_idx"
  ON "ShipmentCardPin"("membershipId", "pinnedAt" DESC);

CREATE INDEX IF NOT EXISTS "ShipmentCardPin_businessUnitId_shipmentId_idx"
  ON "ShipmentCardPin"("businessUnitId", "shipmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShipmentCardPin_businessUnitId_fkey'
  ) THEN
    ALTER TABLE "ShipmentCardPin"
      ADD CONSTRAINT "ShipmentCardPin_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShipmentCardPin_membershipId_fkey'
  ) THEN
    ALTER TABLE "ShipmentCardPin"
      ADD CONSTRAINT "ShipmentCardPin_membershipId_fkey"
      FOREIGN KEY ("membershipId") REFERENCES "Membership"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShipmentCardPin_shipmentId_fkey'
  ) THEN
    ALTER TABLE "ShipmentCardPin"
      ADD CONSTRAINT "ShipmentCardPin_shipmentId_fkey"
      FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
