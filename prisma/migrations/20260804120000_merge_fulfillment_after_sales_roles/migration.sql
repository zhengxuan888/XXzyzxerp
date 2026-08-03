-- 发货与售后属于同一实际岗位：合并权限与员工归属，旧角色仅保留历史标识。
WITH target AS (SELECT id FROM "Role" WHERE code = 'legacy_aftersales' LIMIT 1),
source AS (SELECT id FROM "Role" WHERE code = 'legacy_fulfillment' LIMIT 1)
INSERT INTO "RolePermission" (id, "roleId", "actionKey", scope, "isAllowed", conditions, "createdAt", "updatedAt")
SELECT gen_random_uuid(), target.id, rp."actionKey", rp.scope, TRUE, rp.conditions, NOW(), NOW()
FROM "RolePermission" rp CROSS JOIN target CROSS JOIN source
WHERE rp."roleId" = source.id AND rp."isAllowed" = TRUE
ON CONFLICT ("roleId", "actionKey") DO UPDATE SET
  "isAllowed" = "RolePermission"."isAllowed" OR EXCLUDED."isAllowed",
  scope = CASE WHEN "RolePermission"."isAllowed" THEN "RolePermission".scope ELSE EXCLUDED.scope END,
  "updatedAt" = NOW();

WITH target AS (SELECT id FROM "Role" WHERE code = 'legacy_aftersales' LIMIT 1),
source AS (SELECT id FROM "Role" WHERE code = 'legacy_fulfillment' LIMIT 1)
INSERT INTO "MenuPermission" (id, "roleId", "menuId", "isEnabled", "createdAt")
SELECT gen_random_uuid(), target.id, mp."menuId", TRUE, NOW()
FROM "MenuPermission" mp CROSS JOIN target CROSS JOIN source
WHERE mp."roleId" = source.id AND mp."isEnabled" = TRUE
ON CONFLICT ("menuId", "roleId") DO UPDATE SET "isEnabled" = TRUE;

UPDATE "Membership" SET "roleId" = target.id, "updatedAt" = NOW()
FROM "Role" target, "Role" source
WHERE target.code = 'legacy_aftersales' AND source.code = 'legacy_fulfillment' AND "Membership"."roleId" = source.id;

UPDATE "Role" SET name = '发货与售后', description = '负责订单导出、发货、物流回传、物流跟进与售后处理。', "updatedAt" = NOW()
WHERE code = 'legacy_aftersales';

UPDATE "Role" SET name = '已合并：发货', description = '已合并至“发货与售后”，仅保留历史记录，不再分配。', "updatedAt" = NOW()
WHERE code = 'legacy_fulfillment';
