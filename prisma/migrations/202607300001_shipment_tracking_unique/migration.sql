-- A tracking number identifies at most one shipment inside a business unit.
-- PostgreSQL unique indexes allow multiple NULL values, so shipments waiting
-- for a tracking number can still coexist.
CREATE UNIQUE INDEX "Shipment_businessUnitId_trackingNo_key"
ON "Shipment"("businessUnitId", "trackingNo");

DROP INDEX IF EXISTS "Shipment_businessUnitId_trackingNo_idx";
