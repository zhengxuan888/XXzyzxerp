-- Document Center v2: existing document records are preserved and visible as
-- approved legacy records. New uploads are stored through an Attachment and
-- enter an explicit review workflow rather than accepting a client storage path.
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document"
  ADD COLUMN "ownerMembershipId" TEXT,
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "attachmentId" TEXT,
  ADD COLUMN "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByMembershipId" TEXT,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- A legacy row may predate Membership. Link it when a clear membership is
-- available; remaining nulls deliberately retain their legacy ownerUserId
-- fallback rather than inventing an organisation assignment.
UPDATE "Document" AS d
SET "ownerMembershipId" = (
  SELECT m."id"
  FROM "Membership" AS m
  WHERE m."userId" = d."ownerUserId"
    AND m."businessUnitId" = d."businessUnitId"
    AND m."legalEntityId" = d."legalEntityId"
  ORDER BY m."isPrimary" DESC, m."createdAt" DESC, m."id" DESC
  LIMIT 1
)
WHERE d."ownerMembershipId" IS NULL;

CREATE UNIQUE INDEX "Document_attachmentId_key" ON "Document"("attachmentId");
CREATE INDEX "Document_businessUnitId_reviewStatus_createdAt_id_idx" ON "Document"("businessUnitId", "reviewStatus", "createdAt", "id");
CREATE INDEX "Document_businessUnitId_categoryId_reviewStatus_idx" ON "Document"("businessUnitId", "categoryId", "reviewStatus");
CREATE INDEX "Document_ownerMembershipId_idx" ON "Document"("ownerMembershipId");
CREATE UNIQUE INDEX "DocumentCategory_businessUnitId_code_key" ON "DocumentCategory"("businessUnitId", "code");
CREATE INDEX "DocumentCategory_businessUnitId_isActive_sortOrder_idx" ON "DocumentCategory"("businessUnitId", "isActive", "sortOrder");

ALTER TABLE "DocumentCategory"
  ADD CONSTRAINT "DocumentCategory_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentCategory_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_ownerMembershipId_fkey"
  FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Document_reviewedByMembershipId_fkey"
  FOREIGN KEY ("reviewedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Document_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Document_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
