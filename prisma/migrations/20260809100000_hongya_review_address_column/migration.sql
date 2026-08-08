-- The Hongya dropship workbook is a review copy. Keep exactly one source-address
-- column beside the structured street address and make the required deletion
-- instruction explicit. Existing batch snapshots and stored workbooks are not
-- touched, so historical exports remain byte-for-byte unchanged.
WITH target AS (
  SELECT id, configuration
  FROM "LogisticsProviderTemplate"
  WHERE code IN ('HONGYA_IBERIA_DROPSHIP', 'HONGYA_EAST_EU_DROPSHIP')
    AND jsonb_typeof(configuration->'columns') = 'array'
), base_columns AS (
  SELECT
    target.id,
    column_item,
    ordinal * 2 AS sort_order
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements(target.configuration->'columns')
    WITH ORDINALITY AS items(column_item, ordinal)
  WHERE column_item->>'field' <> 'recipientFullAddress'
), review_columns AS (
  SELECT
    target.id,
    jsonb_build_object(
      'field', 'recipientFullAddress',
      'header', '完整原始地址（核对后删除）'
    ) AS column_item,
    COALESCE(
      (
        SELECT MIN(base.sort_order) + 1
        FROM base_columns base
        WHERE base.id = target.id
          AND base.column_item->>'field' = 'recipientAddress'
      ),
      (
        SELECT COALESCE(MAX(base.sort_order), 0) + 1
        FROM base_columns base
        WHERE base.id = target.id
      )
    ) AS sort_order
  FROM target
), rebuilt AS (
  SELECT id, jsonb_agg(column_item ORDER BY sort_order) AS columns
  FROM (
    SELECT id, column_item, sort_order FROM base_columns
    UNION ALL
    SELECT id, column_item, sort_order FROM review_columns
  ) normalized
  GROUP BY id
)
UPDATE "LogisticsProviderTemplate" template
SET configuration = jsonb_set(template.configuration, '{columns}', rebuilt.columns),
    version = template.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM rebuilt
WHERE template.id = rebuilt.id
  AND template.configuration->'columns' IS DISTINCT FROM rebuilt.columns;
