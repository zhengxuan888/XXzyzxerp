ALTER TABLE "LogisticsWorkbenchSetting"
ADD COLUMN "alertRules" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 30;
