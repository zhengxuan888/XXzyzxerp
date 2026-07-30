-- DropIndex
DROP INDEX "Order_businessUnitId_shopId_idx";

-- AlterTable
ALTER TABLE "LogisticsWorkbenchSetting" ALTER COLUMN "alertRules" DROP DEFAULT;
