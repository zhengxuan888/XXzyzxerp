ALTER TABLE "Order" ADD COLUMN "recipientFullAddress" TEXT;

UPDATE "Order"
SET "recipientFullAddress" = "recipientAddress"
WHERE "recipientFullAddress" IS NULL AND "recipientAddress" IS NOT NULL;

-- Only update the confirmed Iberia and East Europe workbooks.
WITH target AS (
  SELECT id, configuration
  FROM "LogisticsProviderTemplate"
  WHERE code IN ('HONGYA_IBERIA_DROPSHIP', 'HONGYA_EAST_EU_DROPSHIP')
), expanded AS (
  SELECT
    target.id,
    ordinal * 2 AS sort_order,
    CASE column_item->>'field'
      WHEN 'custom:declaredNameEn' THEN jsonb_set(column_item, '{field}', '"constant:Phone"'::jsonb)
      WHEN 'productNames' THEN jsonb_set(column_item, '{field}', '"constant:\u624b\u673a"'::jsonb)
      WHEN 'custom:declaredAmount' THEN jsonb_set(column_item, '{field}', '"unitPrice"'::jsonb)
      WHEN 'productSkus' THEN jsonb_set(column_item, '{field}', '"constant:HYBH-SJ-X"'::jsonb)
      ELSE column_item
    END AS column_item
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements(target.configuration->'columns') WITH ORDINALITY AS items(column_item, ordinal)

  UNION ALL

  SELECT
    target.id,
    ordinal * 2 + 1,
    jsonb_build_object(
      'field', 'recipientFullAddress',
      'header', U&'\5B8C\6574\539F\59CB\5730\5740\FF08\4EBA\5DE5\6838\5BF9\FF09'
    )
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements(target.configuration->'columns') WITH ORDINALITY AS items(column_item, ordinal)
  WHERE column_item->>'field' = 'recipientAddress'
), rebuilt AS (
  SELECT id, jsonb_agg(column_item ORDER BY sort_order) AS columns
  FROM expanded
  GROUP BY id
)
UPDATE "LogisticsProviderTemplate" template
SET configuration = jsonb_set(template.configuration, '{columns}', rebuilt.columns),
    version = template.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM rebuilt
WHERE template.id = rebuilt.id;
