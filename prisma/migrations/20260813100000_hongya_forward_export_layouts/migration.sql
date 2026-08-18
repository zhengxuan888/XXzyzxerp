-- Restore the two Hongya forwarding workbooks from operations-approved
-- examples. Only the two known legacy column fingerprints are upgraded. If an
-- administrator has created a third layout, fail closed instead of silently
-- overwriting it. Historical batch snapshots and generated files are immutable
-- and are intentionally not touched by this migration.
DO $migration$
DECLARE
  template_record RECORD;
  next_configuration JSONB;
  west_legacy_routes JSONB := '{"PT":"R葡萄牙COD专线(转寄)","ES":"R西班牙COD专线(转寄)"}'::jsonb;
  west_target_routes JSONB := '{"PT":"CT葡萄牙COD专线(转寄)","ES":"CT西班牙COD专线(转寄)"}'::jsonb;
  west_legacy_columns JSONB := $json$
  [
    {"field":"custom:originalTrackingNo","header":"客户订单号"},
    {"field":"orderNo","header":"客户订单编号"},
    {"field":"shippingRoute","header":"运输渠道"},
    {"field":"custom:declaredNameEn","header":"海关报关品名1"},
    {"field":"productNames","header":"中文品名1"},
    {"field":"quantity","header":"申报品数量1"},
    {"field":"custom:declaredAmount","header":"申报金额"},
    {"field":"custom:declaredCurrency","header":"海关申报币种"},
    {"field":"recipientName","header":"收件人姓名"},
    {"field":"recipientPhone","header":"收件人电话"},
    {"field":"recipientCountryCode","header":"国家代码"},
    {"field":"custom:weightKg","header":"重量"},
    {"field":"recipientRegion","header":"收件人省份"},
    {"field":"recipientCity","header":"收件人城市"},
    {"field":"recipientAddress","header":"收件人地址"},
    {"field":"recipientPostalCode","header":"收件人邮编"},
    {"field":"constant:1","header":"包裹件数"},
    {"field":"codAmount","header":"代收金额"},
    {"field":"currency","header":"代收货款币种"},
    {"field":"recipientEmail","header":"收件人邮箱"}
  ]
  $json$::jsonb;
  -- Compatibility fingerprint for databases that deployed the later
  -- 20260818153000 master migration before this branch migration existed.
  -- It changed only the four customs field identifiers in the 20-column
  -- legacy layout. Treat it as a known input, then rebuild the complete
  -- operations-approved forwarding layout below.
  west_master_customs_columns JSONB := $json$
  [
    {"field":"custom:originalTrackingNo","header":"客户订单号"},
    {"field":"orderNo","header":"客户订单编号"},
    {"field":"shippingRoute","header":"运输渠道"},
    {"field":"constant:Phone","header":"海关报关品名1"},
    {"field":"constant:手机","header":"中文品名1"},
    {"field":"quantity","header":"申报品数量1"},
    {"field":"declarationAmount","header":"申报金额"},
    {"field":"declarationCurrency","header":"海关申报币种"},
    {"field":"recipientName","header":"收件人姓名"},
    {"field":"recipientPhone","header":"收件人电话"},
    {"field":"recipientCountryCode","header":"国家代码"},
    {"field":"custom:weightKg","header":"重量"},
    {"field":"recipientRegion","header":"收件人省份"},
    {"field":"recipientCity","header":"收件人城市"},
    {"field":"recipientAddress","header":"收件人地址"},
    {"field":"recipientPostalCode","header":"收件人邮编"},
    {"field":"constant:1","header":"包裹件数"},
    {"field":"codAmount","header":"代收金额"},
    {"field":"currency","header":"代收货款币种"},
    {"field":"recipientEmail","header":"收件人邮箱"}
  ]
  $json$::jsonb;
  west_target_columns JSONB := $json$
  [
    {"field":"custom:originalTrackingNo","header":"客户订单号"},
    {"field":"orderNo","header":"客户订单编号"},
    {"field":"shippingRoute","header":"运输渠道"},
    {"field":"constant:Phone","header":"海关报关品名1"},
    {"field":"constant:手机","header":"中文品名1"},
    {"field":"quantity","header":"申报品数量1"},
    {"field":"unitPrice","header":"申报金额"},
    {"field":"constant:EUR","header":"海关申报币种"},
    {"field":"recipientName","header":"收件人姓名"},
    {"field":"recipientPhone","header":"收件人电话"},
    {"field":"recipientCountryCode","header":"国家代码"},
    {"field":"constant:0.2","header":"重量"},
    {"field":"recipientRegion","header":"收件人省份"},
    {"field":"recipientCity","header":"收件人城市"},
    {"field":"recipientAddress","header":"收件人地址"},
    {"field":"recipientFullAddress","header":"完整原始地址（核对后删除）"},
    {"field":"recipientPostalCode","header":"收件人邮编"},
    {"field":"constant:1","header":"包裹件数"},
    {"field":"codAmount","header":"代收金额"},
    {"field":"currency","header":"代收货款币种"},
    {"field":"recipientEmail","header":"收件人邮箱"},
    {"field":"salesName","header":"录单员工"},
    {"field":"productConfigurations","header":"具体型号配置"}
  ]
  $json$::jsonb;
  east_legacy_columns JSONB := $json$
  [
    {"field":"orderNo","header":"订单号"},
    {"field":"recipientName","header":"收件人"},
    {"field":"recipientPhone","header":"联系电话"},
    {"field":"recipientEmail","header":"邮箱"},
    {"field":"recipientCountryCode","header":"国家"},
    {"field":"recipientPostalCode","header":"邮编"},
    {"field":"recipientRegion","header":"州/区域"},
    {"field":"recipientCity","header":"城市"},
    {"field":"recipientAddress","header":"详细地址"},
    {"field":"productNames","header":"产品名称"},
    {"field":"quantity","header":"数量"},
    {"field":"codAmount","header":"COD金额"},
    {"field":"currency","header":"币种"},
    {"field":"customerWhatsapp","header":"WhatsApp"},
    {"field":"note","header":"备注"}
  ]
  $json$::jsonb;
  east_target_columns JSONB := $json$
  [
    {"field":"custom:originalTrackingNo","header":"客户订单号"},
    {"field":"orderNo","header":"客户订单编号"},
    {"field":"shippingRoute","header":"运输方式"},
    {"field":"recipientCountryCode","header":"目的国家"},
    {"field":"recipientName","header":"收件人姓名"},
    {"field":"recipientRegion","header":"收件人州省"},
    {"field":"recipientDistrict","header":"收件人区"},
    {"field":"recipientCity","header":"收件人城市"},
    {"field":"recipientStreet","header":"收件人地址"},
    {"field":"recipientHouseNumber","header":"收件人门牌号"},
    {"field":"custom:streetNumber","header":"收件人街道号"},
    {"field":"recipientFullAddress","header":"完整原始地址（核对后删除）"},
    {"field":"recipientPhone","header":"收件人电话"},
    {"field":"recipientPostalCode","header":"收件人邮编"},
    {"field":"recipientEmail","header":"收件人邮箱"},
    {"field":"codAmount","header":"代收货款"},
    {"field":"currency","header":"代收币种"},
    {"field":"constant:Phone","header":"海关报关品名1"},
    {"field":"constant:手机","header":"中文品名1"},
    {"field":"quantity","header":"申报品数量1"},
    {"field":"unitPrice","header":"申报价值1"},
    {"field":"constant:EUR","header":"申报币种1"},
    {"field":"constant:HYBH-SJ-X","header":"配货信息1"},
    {"field":"salesName","header":"录单员工"},
    {"field":"productConfigurations","header":"具体型号配置"}
  ]
  $json$::jsonb;
BEGIN
  FOR template_record IN
    SELECT template."id", template."businessUnitId", template."configuration"
    FROM "LogisticsProviderTemplate" template
    JOIN "BusinessUnit" business_unit ON business_unit."id" = template."businessUnitId"
    WHERE business_unit."code" = 'FB-COD'
      AND template."code" = 'HONGYA_IBERIA_FORWARD'
      AND template."carrierName" = '鸿亚'
      AND template."archivedAt" IS NULL
    ORDER BY template."businessUnitId", template."id"
  LOOP
    IF jsonb_typeof(template_record."configuration"->'columns') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'HONGYA_IBERIA_FORWARD columns must be a JSON array';
    END IF;
    IF template_record."configuration"->'columns' IS DISTINCT FROM west_legacy_columns
       AND template_record."configuration"->'columns' IS DISTINCT FROM west_master_customs_columns
       AND template_record."configuration"->'columns' IS DISTINCT FROM west_target_columns THEN
      RAISE EXCEPTION 'HONGYA_IBERIA_FORWARD has an unknown column layout; refusing to overwrite it';
    END IF;
    IF jsonb_typeof(template_record."configuration"->'countryRoutes') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'HONGYA_IBERIA_FORWARD countryRoutes must be a JSON object';
    END IF;
    IF template_record."configuration"->'countryRoutes' IS DISTINCT FROM west_legacy_routes
       AND template_record."configuration"->'countryRoutes' IS DISTINCT FROM west_target_routes THEN
      RAISE EXCEPTION 'HONGYA_IBERIA_FORWARD has unknown country routes; refusing to overwrite approved routing';
    END IF;

    next_configuration := jsonb_set(template_record."configuration", '{columns}', west_target_columns);
    next_configuration := jsonb_set(next_configuration, '{sheetName}', '"Sheet1"'::jsonb);
    next_configuration := jsonb_set(next_configuration, '{headerFill}', '"FFFF00"'::jsonb);
    next_configuration := jsonb_set(next_configuration, '{headerFontColor}', '"000000"'::jsonb);
    next_configuration := jsonb_set(next_configuration, '{countryRoutes}', west_target_routes);

    UPDATE "LogisticsProviderTemplate"
    SET "name" = '西葡转寄（鸿亚）',
        "configuration" = next_configuration,
        "version" = "version" + 1,
        "isActive" = true,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = template_record."id"
      AND (
        "name" IS DISTINCT FROM '西葡转寄（鸿亚）'
        OR "configuration" IS DISTINCT FROM next_configuration
        OR "isActive" IS DISTINCT FROM true
      );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM "LogisticsProviderTemplate" template
    JOIN "BusinessUnit" business_unit ON business_unit."id" = template."businessUnitId"
    WHERE business_unit."code" = 'FB-COD'
      AND template."code" IN ('（鸿亚）东欧转寄', 'HONGYA_EAST_EU_FORWARD', 'HONGYA_EAST_FORWARD')
      AND template."carrierName" = '鸿亚'
      AND template."archivedAt" IS NULL
    GROUP BY template."businessUnitId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple active Hongya East-Europe forwarding templates found; refusing an ambiguous upgrade';
  END IF;

  FOR template_record IN
    SELECT template."id", template."businessUnitId", template."code", template."configuration"
    FROM "LogisticsProviderTemplate" template
    JOIN "BusinessUnit" business_unit ON business_unit."id" = template."businessUnitId"
    WHERE business_unit."code" = 'FB-COD'
      AND template."code" IN ('（鸿亚）东欧转寄', 'HONGYA_EAST_EU_FORWARD', 'HONGYA_EAST_FORWARD')
      AND template."carrierName" = '鸿亚'
      AND template."archivedAt" IS NULL
    ORDER BY template."businessUnitId", template."id"
  LOOP
    IF jsonb_typeof(template_record."configuration"->'columns') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '% columns must be a JSON array', template_record."code";
    END IF;
    IF template_record."configuration"->'columns' IS DISTINCT FROM east_legacy_columns
       AND template_record."configuration"->'columns' IS DISTINCT FROM east_target_columns THEN
      RAISE EXCEPTION '% has an unknown column layout; refusing to overwrite it', template_record."code";
    END IF;

    next_configuration := jsonb_set(template_record."configuration", '{columns}', east_target_columns);
    next_configuration := jsonb_set(next_configuration, '{sheetName}', '"Sheet1"'::jsonb);
    next_configuration := jsonb_set(next_configuration, '{headerFill}', '"FFFF00"'::jsonb);
    next_configuration := jsonb_set(next_configuration, '{headerFontColor}', '"000000"'::jsonb);

    UPDATE "LogisticsProviderTemplate"
    SET "name" = '东欧转寄（鸿亚）',
        "configuration" = next_configuration,
        "version" = "version" + 1,
        "isActive" = true,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = template_record."id"
      AND (
        "name" IS DISTINCT FROM '东欧转寄（鸿亚）'
        OR "configuration" IS DISTINCT FROM next_configuration
        OR "isActive" IS DISTINCT FROM true
      );
  END LOOP;
END
$migration$;
