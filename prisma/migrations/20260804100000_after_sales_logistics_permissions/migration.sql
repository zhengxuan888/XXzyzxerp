-- Keep imported legacy role descriptions readable and make the complete
-- provider handoff workflow reproducible on every deployment.
UPDATE "Role"
SET "description" = CASE "code"
  WHEN 'legacy_admin' THEN '管理系统配置、组织权限与全部业务。'
  WHEN 'legacy_aftersales' THEN '处理客户、发货、物流跟进与售后事项。'
  WHEN 'legacy_ceo' THEN '查看并管理公司整体业务。'
  WHEN 'legacy_director' THEN '管理业务团队并查看经营数据。'
  WHEN 'legacy_employee' THEN '执行日常订单与业务操作。'
  WHEN 'legacy_finance' THEN '处理费用、对账与财务审批。'
  WHEN 'legacy_fulfillment' THEN '处理待发货订单与物流信息。'
  WHEN 'legacy_hr' THEN '管理员工、岗位、考勤与请假。'
  WHEN 'legacy_manager' THEN '管理部门人员与业务进度。'
  ELSE "description"
END
WHERE "code" LIKE 'legacy_%';

INSERT INTO "RolePermission" ("id", "roleId", "actionKey", "scope", "isAllowed", "conditions", "updatedAt")
SELECT gen_random_uuid(), role."id", permission."actionKey", 'BUSINESS_UNIT', true, NULL, CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN (VALUES
  ('order.ship'),
  ('shipment.create'),
  ('shipment.read'),
  ('shipment.track.update'),
  ('logistics_template.read'),
  ('logistics_template.export'),
  ('logistics.export_batch.read'),
  ('logistics.export_batch.create'),
  ('logistics.export_batch.dispatch'),
  ('logistics.return_import.preview'),
  ('logistics.return_import.confirm'),
  ('logistics.batch_artifact.read')
) AS permission("actionKey")
WHERE role."code" = 'legacy_aftersales'
  AND EXISTS (SELECT 1 FROM "Action" action WHERE action."key" = permission."actionKey")
ON CONFLICT ("roleId", "actionKey") DO UPDATE SET
  "scope" = EXCLUDED."scope",
  "isAllowed" = true,
  "conditions" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "MenuPermission" ("id", "menuId", "roleId", "isEnabled")
SELECT gen_random_uuid(), menu."id", role."id", true
FROM "Role" role
CROSS JOIN "Menu" menu
WHERE role."code" = 'legacy_aftersales'
  AND menu."key" IN ('shipping-workbench', 'shipments')
ON CONFLICT ("menuId", "roleId") DO UPDATE SET "isEnabled" = true;
