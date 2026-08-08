-- The original address column was initially backfilled from the structured
-- delivery address. Those rows are not genuine customer-provided originals
-- and must be recaptured before they can pass logistics review.
UPDATE "Order"
SET "recipientFullAddress" = NULL
WHERE "recipientFullAddress" IS NOT NULL
  AND "recipientAddress" IS NOT NULL
  AND btrim("recipientFullAddress") = btrim("recipientAddress");
