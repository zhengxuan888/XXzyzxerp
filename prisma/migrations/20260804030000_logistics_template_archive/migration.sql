ALTER TABLE "LogisticsProviderTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "LogisticsProviderTemplate_businessUnitId_isActive_idx";
CREATE INDEX "LogisticsProviderTemplate_businessUnitId_archivedAt_isActive_idx"
ON "LogisticsProviderTemplate"("businessUnitId", "archivedAt", "isActive");

UPDATE "Country" SET "sortOrder" = "sortOrder" + 1000;

INSERT INTO "Country" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
('country-AL','AL','阿尔巴尼亚',true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-AD','AD','安道尔',true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-AT','AT','奥地利',true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-BY','BY','白俄罗斯',true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-BE','BE','比利时',true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-IS','IS','冰岛',true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-BA','BA','波斯尼亚和黑塞哥维那',true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-BG','BG','保加利亚',true,8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-PL','PL','波兰',true,9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-DK','DK','丹麦',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-DE','DE','德国',true,11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-RU','RU','俄罗斯',true,12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-FR','FR','法国',true,13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-VA','VA','梵蒂冈',true,14,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-FI','FI','芬兰',true,15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-GE','GE','格鲁吉亚',true,16,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-ME','ME','黑山',true,17,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-NL','NL','荷兰',true,18,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-CZ','CZ','捷克',true,19,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-HR','HR','克罗地亚',true,20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-LV','LV','拉脱维亚',true,21,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-LT','LT','立陶宛',true,22,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-LI','LI','列支敦士登',true,23,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-LU','LU','卢森堡',true,24,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-RO','RO','罗马尼亚',true,25,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-MT','MT','马耳他',true,26,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-MK','MK','北马其顿',true,27,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-MD','MD','摩尔多瓦',true,28,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-MC','MC','摩纳哥',true,29,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-NO','NO','挪威',true,30,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-PT','PT','葡萄牙',true,31,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-SE','SE','瑞典',true,32,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-CH','CH','瑞士',true,33,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-RS','RS','塞尔维亚',true,34,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-CY','CY','塞浦路斯',true,35,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-SM','SM','圣马力诺',true,36,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-SK','SK','斯洛伐克',true,37,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-SI','SI','斯洛文尼亚',true,38,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-TR','TR','土耳其',true,39,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-UA','UA','乌克兰',true,40,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-ES','ES','西班牙',true,41,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-GR','GR','希腊',true,42,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-HU','HU','匈牙利',true,43,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-AM','AM','亚美尼亚',true,44,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-AZ','AZ','阿塞拜疆',true,45,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-IT','IT','意大利',true,46,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-GB','GB','英国',true,47,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-EE','EE','爱沙尼亚',true,48,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-IE','IE','爱尔兰',true,49,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('country-XK','XK','科索沃',true,50,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
