-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "customerWhatsapp" TEXT,
ADD COLUMN     "logisticsChannel" TEXT,
ADD COLUMN     "orderTemplateId" TEXT,
ADD COLUMN     "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "packageWeightGrams" INTEGER,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "recipientAddress" TEXT,
ADD COLUMN     "recipientCity" TEXT,
ADD COLUMN     "recipientCountryCode" TEXT,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "recipientPostalCode" TEXT,
ADD COLUMN     "recipientRegion" TEXT,
ADD COLUMN     "staffWhatsapp" TEXT,
ADD COLUMN     "templateSnapshot" JSONB;

-- CreateTable
CREATE TABLE "OrderTemplate" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configuration" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderTemplate_businessUnitId_isActive_idx" ON "OrderTemplate"("businessUnitId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTemplate_businessUnitId_code_key" ON "OrderTemplate"("businessUnitId", "code");

-- CreateIndex
CREATE INDEX "Order_orderTemplateId_idx" ON "Order"("orderTemplateId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderTemplateId_fkey" FOREIGN KEY ("orderTemplateId") REFERENCES "OrderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTemplate" ADD CONSTRAINT "OrderTemplate_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTemplate" ADD CONSTRAINT "OrderTemplate_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
