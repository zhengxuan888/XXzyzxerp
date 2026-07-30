-- These indexes support the logistics workbench's stable business-unit queues,
-- ownership filters, hierarchy filters, and per-shipment event signal lookup.
-- They are additive and safe to roll back by dropping only the named indexes.
CREATE INDEX "Order_businessUnitId_departmentId_creatorUserId_createdAt_idx"
ON "Order"("businessUnitId", "departmentId", "creatorUserId", "createdAt");

CREATE INDEX "Order_businessUnitId_recipientCountryCode_idx"
ON "Order"("businessUnitId", "recipientCountryCode");

CREATE INDEX "Shipment_businessUnitId_status_createdAt_id_idx"
ON "Shipment"("businessUnitId", "status", "createdAt", "id");

CREATE INDEX "Shipment_businessUnitId_ownerMembershipId_createdAt_id_idx"
ON "Shipment"("businessUnitId", "ownerMembershipId", "createdAt", "id");

CREATE INDEX "ShipmentEvent_shipmentId_eventType_occurredAt_idx"
ON "ShipmentEvent"("shipmentId", "eventType", "occurredAt");
