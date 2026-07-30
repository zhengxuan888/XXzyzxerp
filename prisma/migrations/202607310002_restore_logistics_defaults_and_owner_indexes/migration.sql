-- Repair the previously applied schema-drift migration without rewriting
-- migration history or touching existing data. Keep legacy shop filtering and
-- a safe default for new logistics settings, then add the ownership and
-- timeline indexes used by the scoped workbench queries.

CREATE INDEX IF NOT EXISTS "Order_businessUnitId_shopId_idx"
ON "Order"("businessUnitId", "shopId");

ALTER TABLE "LogisticsWorkbenchSetting"
ALTER COLUMN "alertRules" SET DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "Order_businessUnitId_ownedByMembershipId_createdAt_id_idx"
ON "Order"("businessUnitId", "ownedByMembershipId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "ShipmentEvent_shipmentId_occurredAt_id_idx"
ON "ShipmentEvent"("shipmentId", "occurredAt", "id");
