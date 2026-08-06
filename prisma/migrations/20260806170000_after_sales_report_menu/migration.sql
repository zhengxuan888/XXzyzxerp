INSERT INTO "Menu" (
  "id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive",
  "requiredActionKey", "requiredCondition", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'after-sales-report',
  '售后日报',
  '/admin/after-sales-report',
  NULL,
  parent."id",
  45,
  TRUE,
  'shipment.read',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Menu" AS parent
WHERE parent."key" = 'group-logistics'
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "path" = EXCLUDED."path",
  "parentId" = EXCLUDED."parentId",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = TRUE,
  "requiredActionKey" = EXCLUDED."requiredActionKey",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "MenuPermission" ("id", "menuId", "roleId", "isEnabled", "createdAt")
SELECT
  gen_random_uuid()::text,
  report."id",
  permission."roleId",
  permission."isEnabled",
  CURRENT_TIMESTAMP
FROM "Menu" AS report
JOIN "Menu" AS shipments ON shipments."key" = 'shipments'
JOIN "MenuPermission" AS permission ON permission."menuId" = shipments."id"
WHERE report."key" = 'after-sales-report'
ON CONFLICT ("menuId", "roleId") DO UPDATE SET
  "isEnabled" = EXCLUDED."isEnabled";
