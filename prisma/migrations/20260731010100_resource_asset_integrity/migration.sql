-- Guard rails intentionally live in the database as well as in API input
-- validation. These constraints make accidental direct writes fail closed.
ALTER TABLE "ResourceAsset"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ResourceAsset"
  ADD CONSTRAINT "ResourceAsset_quantity_guard"
  CHECK ("quantity" >= 1 AND "availableQuantity" >= 0 AND "availableQuantity" <= "quantity");

ALTER TABLE "SoftwareAssetProfile"
  ADD CONSTRAINT "SoftwareAssetProfile_seats_guard"
  CHECK ("seatsUsed" >= 0 AND ("seatsTotal" IS NULL OR "seatsUsed" <= "seatsTotal"));
