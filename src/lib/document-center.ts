import type { DocumentReviewStatus, Prisma } from "@prisma/client";

import type { AuthContext } from "@/lib/api-auth";
import { createDocumentAccessPlan, type DocumentAccessPlan, type DocumentAccessTarget } from "@/lib/document-access";

export type DocumentVisibilityPlan = {
  readPlan: DocumentAccessPlan;
  reviewPlan: DocumentAccessPlan;
  where: Prisma.DocumentWhereInput;
  allows: (document: DocumentAccessTarget & { reviewStatus: DocumentReviewStatus }) => boolean;
};

function isOwner(auth: AuthContext, document: Pick<DocumentAccessTarget, "ownerUserId" | "ownerMembershipId">) {
  return document.ownerMembershipId === auth.membership.id || (!document.ownerMembershipId && document.ownerUserId === auth.userId);
}

/**
 * New documents remain private to their uploader until a configured reviewer
 * approves them. A reviewer can see a pending or rejected document only when
 * both read and review scope match; visibility never comes from a client flag.
 */
export async function createDocumentVisibilityPlan(auth: AuthContext): Promise<DocumentVisibilityPlan> {
  const [readPlan, reviewPlan] = await Promise.all([
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.read" }),
    createDocumentAccessPlan({ membership: auth.membership, actionKey: "document.review" }),
  ]);

  const reviewerWhere = reviewPlan.allowed ? [reviewPlan.where] : [];
  return {
    readPlan,
    reviewPlan,
    where: {
      AND: [
        readPlan.where,
        { archivedAt: null },
        {
          OR: [
            { reviewStatus: "APPROVED" },
            { ownerMembershipId: auth.membership.id },
            { ownerMembershipId: null, ownerUserId: auth.userId },
            ...reviewerWhere,
          ],
        },
      ],
    },
    allows: (document) => {
      if (!readPlan.allows(document)) return false;
      return document.reviewStatus === "APPROVED" || isOwner(auth, document) || reviewPlan.allows(document);
    },
  };
}

export function parseReviewStatus(value: string | null): DocumentReviewStatus | null {
  if (!value || value === "ALL") return null;
  const statuses: DocumentReviewStatus[] = ["PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"];
  return statuses.includes(value as DocumentReviewStatus) ? (value as DocumentReviewStatus) : null;
}

export function textQuery(value: string | null, maxLength = 120) {
  return value?.trim().slice(0, maxLength) ?? "";
}
