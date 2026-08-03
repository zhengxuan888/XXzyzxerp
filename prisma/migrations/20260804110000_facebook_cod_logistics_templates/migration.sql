-- Register the four real provider export layouts supplied by operations.
-- Values captured during order entry are mapped automatically; provider-only
-- declaration fields remain configurable through order custom fields.
WITH target AS (
  SELECT "id", "legalEntityId" FROM "BusinessUnit"
  WHERE "name" = 'Facebook COD' AND "isActive" = true
  ORDER BY "createdAt" ASC LIMIT 1
), templates("code", "name", "carrierName", "configuration") AS (
  VALUES
  ('FAN_RO_WMS', '罗马尼亚 FAN WMS', 'FAN Courier', $$
  {
    "sheetName":"sheet1","headerFontColor":"FF0000","headerFill":null,"countryRoutes":{},
    "columns":[
      {"field":"orderNo","header":"订单参考号()"},{"field":"quantity","header":"产品汇总数量()"},
      {"field":"productNames","header":"中文品名(中文品名，用于清关，尽量简短)"},{"field":"productNames","header":"英文品名(英文品名，用于清关，尽量简短)"},
      {"field":"productNames","header":"货物描述(更多产品明细，可包含SKU、用途或产品特别注意事项等等)"},{"field":"custom:declaredAmount","header":"申报金额()"},
      {"field":"custom:declaredCurrency","header":"申报币别(三字母币种)"},{"field":"recipientName","header":"收件人名称()"},
      {"field":"recipientPhone","header":"收件电话()"},{"field":"recipientRegion","header":"收件省()"},
      {"field":"recipientCity","header":"收件城市()"},{"field":"custom:recipientDistrict","header":"收件区县()"},
      {"field":"recipientAddress","header":"收件详细地址()"},{"field":"recipientPostalCode","header":"收件邮编()"},
      {"field":"note","header":"备注(订单信息备注显示在物流面单上（对接渠道），但不显示在拣货单上)"},{"field":"constant:SC","header":"货物类型(填写二字母 GC (General Cargo普货) / SC (Special Cargo特货)/ IC (Inspection Cargo商检货))"},
      {"field":"constant:PP","header":"运费付款方式(填写二字母   PP(月结)/CA(票结)/CC(到付))"},{"field":"constant:1","header":"包裹件数(系统默认为1)"},
      {"field":"custom:pickingNote","header":"拣货单备注(拣货单上产品的备注信息)"},{"field":"recipientCountryCode","header":"目的地二字码(国家二字代码,比如 英国填：GB)"},
      {"field":"custom:customsCode","header":"产品海关编码()"},{"field":"codAmount","header":"代收款金额()"},
      {"field":"currency","header":"代收款币种()"},{"field":"recipientEmail","header":"收件人邮箱()"},
      {"field":"custom:doorNumber","header":"收件人门牌号()"},{"field":"productSkus","header":"客户SKU()"}
    ],
    "returnWorkbook":{"headerScanRows":5,"aliases":{"orderNo":["订单参考号","订单号","客户订单号","原单号"],"trackingNo":["转单号","物流单号","运单号","追踪号"],"carrier":["运输方式","承运商","物流商","物流渠道"],"providerStatus":["状态","订单状态","物流状态"]}}
  }$$::jsonb),
  ('HONGYA_IBERIA_DROPSHIP', '西葡代发（鸿亚）', '鸿亚', $$
  {
    "sheetName":"Sheet1","headerFill":"FFFF00","headerFontColor":"000000","countryRoutes":{"PT":"R葡萄牙COD专线(代发)","ES":"R西班牙COD专线(代发)"},
    "columns":[
      {"field":"orderNo","header":"客户订单号"},{"field":"shippingRoute","header":"运输方式"},{"field":"recipientCountryCode","header":"目的国家"},
      {"field":"recipientName","header":"收件人姓名"},{"field":"recipientRegion","header":"收件人州省"},{"field":"recipientCity","header":"收件人城市"},
      {"field":"recipientAddress","header":"收件人地址"},{"field":"recipientPhone","header":"收件人电话"},{"field":"recipientPostalCode","header":"收件人邮编"},
      {"field":"recipientEmail","header":"收件人邮箱"},{"field":"codAmount","header":"代收货款"},{"field":"currency","header":"代收币种"},
      {"field":"custom:declaredNameEn","header":"海关报关品名1"},{"field":"productNames","header":"中文品名1"},{"field":"quantity","header":"申报品数量1"},
      {"field":"custom:declaredAmount","header":"申报价值1"},{"field":"custom:declaredCurrency","header":"申报币种1"},{"field":"productSkus","header":"配货信息1"},{"field":"note","header":"备注"}
    ],
    "returnWorkbook":{"headerScanRows":5,"aliases":{"orderNo":["客户订单号","原单号","订单号"],"trackingNo":["转单号","物流单号","运单号"],"carrier":["运输方式","承运商","物流渠道"],"providerStatus":["状态","订单状态","物流状态"]}}
  }$$::jsonb),
  ('HONGYA_EAST_EU_DROPSHIP', '东欧代发（鸿亚）', '鸿亚', $$
  {
    "sheetName":"Sheet1","headerFill":"FFFF00","headerFontColor":"000000","countryRoutes":{"HR":"LCHR克罗地亚PKTCOD专线(代发)","CZ":"LC捷克PPLCOD专线(代发)","GR":"LCGR希腊PKTCOD专线(代发)","PL":"PL波兰PZCOD专线-代发","SK":"SK斯洛伐克POSCOD专线(代发)","IT":"LCIT意大利PKTCOD专线(代发)"},
    "columns":[
      {"field":"orderNo","header":"客户订单号"},{"field":"shippingRoute","header":"运输方式"},{"field":"recipientCountryCode","header":"目的国家"},
      {"field":"recipientName","header":"收件人姓名"},{"field":"recipientRegion","header":"收件人州省"},{"field":"custom:recipientDistrict","header":"收件人区"},
      {"field":"recipientCity","header":"收件人城市"},{"field":"recipientAddress","header":"收件人地址"},{"field":"custom:doorNumber","header":"收件人门牌号"},
      {"field":"custom:streetNumber","header":"收件人街道号"},{"field":"recipientPhone","header":"收件人电话"},{"field":"recipientPostalCode","header":"收件人邮编"},
      {"field":"recipientEmail","header":"收件人邮箱"},{"field":"codAmount","header":"代收货款"},{"field":"currency","header":"代收币种"},
      {"field":"custom:declaredNameEn","header":"海关报关品名1"},{"field":"productNames","header":"中文品名1"},{"field":"quantity","header":"申报品数量1"},
      {"field":"custom:declaredAmount","header":"申报价值1"},{"field":"custom:declaredCurrency","header":"申报币种1"},{"field":"productSkus","header":"配货信息1"}
    ],
    "returnWorkbook":{"headerScanRows":5,"aliases":{"orderNo":["客户订单号","原单号","订单号"],"trackingNo":["转单号","物流单号","运单号"],"carrier":["运输方式","承运商","物流渠道"],"providerStatus":["状态","订单状态","物流状态"]}}
  }$$::jsonb),
  ('HONGYA_IBERIA_FORWARD', '西葡转寄（鸿亚）', '鸿亚', $$
  {
    "sheetName":"Sheet1","headerFill":"FFFF00","headerFontColor":"000000","countryRoutes":{"PT":"R葡萄牙COD专线(转寄)","ES":"R西班牙COD专线(转寄)"},
    "columns":[
      {"field":"custom:originalTrackingNo","header":"客户订单号"},{"field":"orderNo","header":"客户订单编号"},{"field":"shippingRoute","header":"运输渠道"},
      {"field":"custom:declaredNameEn","header":"海关报关品名1"},{"field":"productNames","header":"中文品名1"},{"field":"quantity","header":"申报品数量1"},
      {"field":"custom:declaredAmount","header":"申报金额"},{"field":"custom:declaredCurrency","header":"海关申报币种"},{"field":"recipientName","header":"收件人姓名"},
      {"field":"recipientPhone","header":"收件人电话"},{"field":"recipientCountryCode","header":"国家代码"},{"field":"custom:weightKg","header":"重量"},
      {"field":"recipientRegion","header":"收件人省份"},{"field":"recipientCity","header":"收件人城市"},{"field":"recipientAddress","header":"收件人地址"},
      {"field":"recipientPostalCode","header":"收件人邮编"},{"field":"constant:1","header":"包裹件数"},{"field":"codAmount","header":"代收金额"},
      {"field":"currency","header":"代收货款币种"},{"field":"recipientEmail","header":"收件人邮箱"}
    ],
    "returnWorkbook":{"headerScanRows":5,"aliases":{"orderNo":["客户订单编号","原单号","订单号"],"trackingNo":["转单号","物流单号","运单号"],"carrier":["运输渠道","运输方式","承运商"],"providerStatus":["状态","订单状态","物流状态"]}}
  }$$::jsonb)
)
INSERT INTO "LogisticsProviderTemplate" ("id","legalEntityId","businessUnitId","code","name","carrierName","configuration","version","isActive","createdAt","updatedAt")
SELECT gen_random_uuid(), target."legalEntityId", target."id", templates."code", templates."name", templates."carrierName", templates."configuration", 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM target CROSS JOIN templates
ON CONFLICT ("businessUnitId","code") DO UPDATE SET
  "name"=EXCLUDED."name", "carrierName"=EXCLUDED."carrierName", "configuration"=EXCLUDED."configuration", "version"="LogisticsProviderTemplate"."version" + 1, "isActive"=true, "updatedAt"=CURRENT_TIMESTAMP;
