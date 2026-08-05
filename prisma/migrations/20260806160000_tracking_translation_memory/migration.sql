CREATE TABLE "TrackingTranslation" (
  "id" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL,
  "translatedText" TEXT NOT NULL,
  "sourceLanguage" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'GOOGLE_TRANSLATE',
  "useCount" INTEGER NOT NULL DEFAULT 1,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackingTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrackingTranslation_businessUnitId_sourceHash_key" ON "TrackingTranslation"("businessUnitId", "sourceHash");
CREATE INDEX "TrackingTranslation_businessUnitId_lastUsedAt_idx" ON "TrackingTranslation"("businessUnitId", "lastUsedAt");
