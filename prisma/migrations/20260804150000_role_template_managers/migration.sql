-- 独立的角色模板维护能力，避免误用临时转授权规则或开放其他系统配置。
INSERT INTO "Action" (id, key, name, namespace, description, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'role.template.manage', '管理角色模板', 'ERP', '维护角色模板、权限项与对应菜单可见性。', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, "updatedAt" = NOW();

-- 系统管理员与总负责人直接拥有角色模板管理能力。
INSERT INTO "RolePermission" (id, "roleId", "actionKey", scope, "isAllowed", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r.id, 'role.template.manage', 'ALL', TRUE, NOW(), NOW()
FROM "Role" r
WHERE r.code IN ('legacy_admin', 'legacy_ceo')
ON CONFLICT ("roleId", "actionKey") DO UPDATE SET scope = 'ALL', "isAllowed" = TRUE, "updatedAt" = NOW();

-- qiuyu 仅获得角色模板维护能力，不开放菜单、密钥等其他系统配置。
INSERT INTO "AccessGrant" (
  id, "granteeMembershipId", "granterMembershipId", "actionKey", scope, reason,
  "businessUnitId", "grantedAt", "isActive"
)
SELECT gen_random_uuid(), grantee.id, granter.id, 'role.template.manage', 'ALL',
       '负责人授权：维护员工角色模板', grantee."businessUnitId", NOW(), TRUE
FROM "Membership" grantee
JOIN "User" grantee_user ON grantee_user.id = grantee."userId"
JOIN "Membership" granter ON granter."businessUnitId" = grantee."businessUnitId" AND granter."isActive" = TRUE
JOIN "User" granter_user ON granter_user.id = granter."userId"
WHERE lower(grantee_user.username) = 'qiuyu'
  AND lower(granter_user.username) = 'zx001'
  AND grantee."isActive" = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM "AccessGrant" existing
    WHERE existing."granteeMembershipId" = grantee.id
      AND existing."actionKey" = 'role.template.manage'
      AND existing."isActive" = TRUE
      AND existing."revokedAt" IS NULL
  )
LIMIT 1;
