INSERT INTO "Action" ("id", "key", "name", "namespace", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'finance.remittance_admin.read', '查看管理员回款数据', 'finance', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, role."id", 'finance.remittance_admin.read', 'ALL', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" AS role
WHERE role."code" IN ('platform_admin', 'legacy_admin')
ON CONFLICT ("roleId", "actionKey") DO UPDATE SET "scope" = 'ALL', "isAllowed" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Menu" (
  "id", "key", "label", "path", "icon", "parentId", "sortOrder", "isActive",
  "requiredActionKey", "requiredCondition", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, 'finance-remittances', '回款数据', '/admin/finance-remittances', NULL,
  parent."id", 45, TRUE, 'finance.remittance_admin.read', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Menu" AS parent WHERE parent."key" = 'group-finance'
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label", "path" = EXCLUDED."path", "parentId" = EXCLUDED."parentId",
  "sortOrder" = EXCLUDED."sortOrder", "isActive" = TRUE,
  "requiredActionKey" = EXCLUDED."requiredActionKey", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "MenuPermission" ("id", "menuId", "roleId", "isEnabled", "createdAt")
SELECT gen_random_uuid()::text, menu."id", role."id", TRUE, CURRENT_TIMESTAMP
FROM "Menu" AS menu CROSS JOIN "Role" AS role
WHERE menu."key" = 'finance-remittances' AND role."code" IN ('platform_admin', 'legacy_admin')
ON CONFLICT ("menuId", "roleId") DO UPDATE SET "isEnabled" = TRUE;

DELETE FROM "MenuPermission"
WHERE "menuId" = (SELECT "id" FROM "Menu" WHERE "key" = 'finance-remittances')
  AND "roleId" IN (SELECT "id" FROM "Role" WHERE "code" NOT IN ('platform_admin', 'legacy_admin'));
