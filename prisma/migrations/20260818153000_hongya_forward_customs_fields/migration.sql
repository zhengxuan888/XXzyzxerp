-- Make the Hongya forwarding workbook export customs values from stable ERP fields.
WITH target AS (
  SELECT id, configuration
  FROM "LogisticsProviderTemplate"
  WHERE code = 'HONGYA_IBERIA_FORWARD'
), rebuilt AS (
  SELECT
    target.id,
    jsonb_agg(
      CASE column_item->>'field'
        WHEN 'custom:declaredNameEn' THEN jsonb_set(column_item, '{field}', '"constant:Phone"'::jsonb)
        WHEN 'productNames' THEN jsonb_set(column_item, '{field}', '"constant:\u624b\u673a"'::jsonb)
        WHEN 'custom:declaredAmount' THEN jsonb_set(column_item, '{field}', '"declarationAmount"'::jsonb)
        WHEN 'custom:declaredCurrency' THEN jsonb_set(column_item, '{field}', '"declarationCurrency"'::jsonb)
        ELSE column_item
      END
      ORDER BY ordinal
    ) AS columns
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements(target.configuration->'columns') WITH ORDINALITY AS items(column_item, ordinal)
  GROUP BY target.id
)
UPDATE "LogisticsProviderTemplate" template
SET configuration = jsonb_set(template.configuration, '{columns}', rebuilt.columns),
    version = template.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM rebuilt
WHERE template.id = rebuilt.id;
