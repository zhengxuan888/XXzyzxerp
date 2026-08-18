-- Preserve every historical value while distinguishing the initial structured
-- address backfill from a genuine customer-provided original.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "recipientFullAddressSource" TEXT;

UPDATE "Order"
SET "recipientFullAddressSource" = CASE
  WHEN "recipientAddress" IS NOT NULL
    AND btrim("recipientFullAddress") = btrim("recipientAddress")
    THEN 'LEGACY_DERIVED'
  WHEN btrim("recipientFullAddress") <> ''
    THEN 'CUSTOMER_ORIGINAL'
  ELSE NULL
END
WHERE "recipientFullAddress" IS NOT NULL
  AND "recipientFullAddressSource" IS NULL;
