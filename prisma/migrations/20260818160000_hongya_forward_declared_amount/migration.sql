-- Forwarding declaration amount is the frozen order declaration total, not the
-- first item unit price and not the COD amount. Upgrade only the two approved
-- Hongya forwarding layouts. Historical export snapshots and files remain
-- immutable. Unknown/admin-modified layouts fail closed.
DO $migration$
DECLARE
  template_record RECORD;
  west_unit_price_columns JSONB := $json$
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
  west_declared_amount_columns JSONB := $json$
  [
    {"field":"custom:originalTrackingNo","header":"客户订单号"},
    {"field":"orderNo","header":"客户订单编号"},
    {"field":"shippingRoute","header":"运输渠道"},
    {"field":"constant:Phone","header":"海关报关品名1"},
    {"field":"constant:手机","header":"中文品名1"},
    {"field":"quantity","header":"申报品数量1"},
    {"field":"declarationAmount","header":"申报金额"},
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
  east_unit_price_columns JSONB := $json$
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
  east_declared_amount_columns JSONB := $json$
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
    {"field":"declarationAmount","header":"申报价值1"},
    {"field":"constant:EUR","header":"申报币种1"},
    {"field":"constant:HYBH-SJ-X","header":"配货信息1"},
    {"field":"salesName","header":"录单员工"},
    {"field":"productConfigurations","header":"具体型号配置"}
  ]
  $json$::jsonb;
BEGIN
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
    SELECT template."id", template."code", template."configuration"
    FROM "LogisticsProviderTemplate" template
    JOIN "BusinessUnit" business_unit ON business_unit."id" = template."businessUnitId"
    WHERE business_unit."code" = 'FB-COD'
      AND template."code" IN (
        'HONGYA_IBERIA_FORWARD',
        '（鸿亚）东欧转寄',
        'HONGYA_EAST_EU_FORWARD',
        'HONGYA_EAST_FORWARD'
      )
      AND template."carrierName" = '鸿亚'
      AND template."archivedAt" IS NULL
    ORDER BY template."businessUnitId", template."id"
  LOOP
    IF jsonb_typeof(template_record."configuration"->'columns') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '% columns must be a JSON array', template_record."code";
    END IF;

    IF template_record."code" = 'HONGYA_IBERIA_FORWARD' THEN
      IF template_record."configuration"->'columns' = west_declared_amount_columns THEN
        CONTINUE;
      END IF;
      IF template_record."configuration"->'columns' IS DISTINCT FROM west_unit_price_columns THEN
        RAISE EXCEPTION '% has an unknown column layout; refusing to overwrite it', template_record."code";
      END IF;
      UPDATE "LogisticsProviderTemplate"
      SET "configuration" = jsonb_set(template_record."configuration", '{columns}', west_declared_amount_columns),
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = template_record."id";
    ELSE
      IF template_record."configuration"->'columns' = east_declared_amount_columns THEN
        CONTINUE;
      END IF;
      IF template_record."configuration"->'columns' IS DISTINCT FROM east_unit_price_columns THEN
        RAISE EXCEPTION '% has an unknown column layout; refusing to overwrite it', template_record."code";
      END IF;
      UPDATE "LogisticsProviderTemplate"
      SET "configuration" = jsonb_set(template_record."configuration", '{columns}', east_declared_amount_columns),
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = template_record."id";
    END IF;
  END LOOP;
END
$migration$;
