INSERT INTO "Menu" (
  "id",
  "key",
  "label",
  "path",
  "parentId",
  "sortOrder",
  "isActive",
  "requiredActionKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'menu-integrations-admin-route',
  'integrations',
  '第三方接口',
  '/admin/integrations',
  parent."id",
  85,
  true,
  'shipment.workbench.configure',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Menu" AS parent
WHERE parent."key" = 'group-system'
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "path" = EXCLUDED."path",
  "parentId" = EXCLUDED."parentId",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = EXCLUDED."isActive",
  "requiredActionKey" = EXCLUDED."requiredActionKey",
  "updatedAt" = CURRENT_TIMESTAMP;
