-- Append the exact sold model configuration to the confirmed Hongya exports.
WITH target AS (
  SELECT id, configuration
  FROM "LogisticsProviderTemplate"
  WHERE code IN ('HONGYA_IBERIA_DROPSHIP', 'HONGYA_EAST_EU_DROPSHIP')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(configuration->'columns') AS column_item
      WHERE column_item->>'field' = 'productConfigurations'
    )
)
UPDATE "LogisticsProviderTemplate" template
SET configuration = jsonb_set(
      template.configuration,
      '{columns}',
      (template.configuration->'columns')
      || CASE WHEN NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(template.configuration->'columns') AS column_item
        WHERE column_item->>'field' = 'salesName'
      ) THEN jsonb_build_array(
        jsonb_build_object('field', 'salesName', 'header', '录单员工')
      ) ELSE '[]'::jsonb END
      || jsonb_build_array(
        jsonb_build_object('field', 'productConfigurations', 'header', '具体型号配置')
      )
    ),
    version = template.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM target
WHERE template.id = target.id;
