-- An order may have historical shipments, but only one active shipment may
-- wait for confirmation at a time. This closes the race between manual entry
-- and provider-return imports without preventing future reshipments.
CREATE UNIQUE INDEX "Shipment_orderId_pending_key"
ON "Shipment"("orderId")
WHERE "status" = 'PENDING';
