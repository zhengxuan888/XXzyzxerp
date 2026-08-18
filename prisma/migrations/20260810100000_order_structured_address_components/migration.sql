-- Keep the legacy combined and original-address columns unchanged. The new
-- components are nullable so existing orders remain valid without inventing
-- district, street, or house-number data.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "recipientDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientStreet" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientHouseNumber" TEXT;

-- Add the new first-class fields only to the requested Iberia dropship
-- workbook. Missing columns are inserted beside the structured address
-- without changing other providers, existing columns, or batch snapshots.
WITH target AS (
  SELECT id, configuration
  FROM "LogisticsProviderTemplate"
  WHERE code = 'HONGYA_IBERIA_DROPSHIP'
    AND jsonb_typeof(configuration->'columns') = 'array'
), transformed AS (
  SELECT
    target.id,
    target.configuration,
    ordinal,
    ordinal * 10 AS sort_order,
    column_item->>'field' AS normalized_field,
    column_item
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements(target.configuration->'columns')
    WITH ORDINALITY AS items(column_item, ordinal)
), positioned AS (
  SELECT
    transformed.id,
    transformed.configuration,
    transformed.ordinal,
    CASE transformed.normalized_field
      WHEN 'recipientDistrict' THEN COALESCE(
        (SELECT MIN(address_column.sort_order) - 3 FROM transformed address_column WHERE address_column.id = transformed.id AND address_column.normalized_field = 'recipientAddress'),
        transformed.sort_order
      )
      WHEN 'recipientStreet' THEN COALESCE(
        (SELECT MIN(address_column.sort_order) - 2 FROM transformed address_column WHERE address_column.id = transformed.id AND address_column.normalized_field = 'recipientAddress'),
        transformed.sort_order
      )
      WHEN 'recipientHouseNumber' THEN COALESCE(
        (SELECT MIN(address_column.sort_order) - 1 FROM transformed address_column WHERE address_column.id = transformed.id AND address_column.normalized_field = 'recipientAddress'),
        transformed.sort_order
      )
      ELSE transformed.sort_order
    END AS sort_order,
    transformed.normalized_field,
    transformed.column_item
  FROM transformed
), kept AS (
  SELECT positioned.*
  FROM positioned
  WHERE normalized_field NOT IN ('recipientDistrict', 'recipientStreet', 'recipientHouseNumber')
    OR ordinal = (
      SELECT MIN(candidate.ordinal)
      FROM positioned candidate
      WHERE candidate.id = positioned.id
        AND candidate.normalized_field = positioned.normalized_field
    )
), inserted AS (
  SELECT id, column_item, sort_order FROM kept

  UNION ALL

  SELECT
    target.id,
    jsonb_build_object('field', 'recipientDistrict', 'header', '收件人区/县'),
    COALESCE(
      (SELECT MIN(sort_order) - 3 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientAddress'),
      (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM kept WHERE kept.id = target.id)
    )
  FROM target
  WHERE NOT EXISTS (
    SELECT 1 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientDistrict'
  )

  UNION ALL

  SELECT
    target.id,
    jsonb_build_object('field', 'recipientStreet', 'header', '收件人街道'),
    COALESCE(
      (SELECT MIN(sort_order) - 2 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientAddress'),
      (SELECT COALESCE(MAX(sort_order), 0) + 2 FROM kept WHERE kept.id = target.id)
    )
  FROM target
  WHERE NOT EXISTS (
    SELECT 1 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientStreet'
  )

  UNION ALL

  SELECT
    target.id,
    jsonb_build_object('field', 'recipientHouseNumber', 'header', '收件人门牌号'),
    COALESCE(
      (SELECT MIN(sort_order) - 1 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientAddress'),
      (SELECT COALESCE(MAX(sort_order), 0) + 3 FROM kept WHERE kept.id = target.id)
    )
  FROM target
  WHERE NOT EXISTS (
    SELECT 1 FROM kept WHERE kept.id = target.id AND normalized_field = 'recipientHouseNumber'
  )
), rebuilt AS (
  SELECT id, jsonb_agg(column_item ORDER BY sort_order) AS columns
  FROM inserted
  GROUP BY id
)
UPDATE "LogisticsProviderTemplate" template
SET configuration = jsonb_set(template.configuration, '{columns}', rebuilt.columns),
    version = template.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM rebuilt
WHERE template.id = rebuilt.id
  AND template.configuration->'columns' IS DISTINCT FROM rebuilt.columns;
