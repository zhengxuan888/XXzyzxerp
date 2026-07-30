import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkLogisticsBatchAccess } from "@/lib/logistics-batch-access";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return new Response(null, { status: 401 });
  const { id } = await context.params;
  const artifact = await prisma.logisticsBatchArtifact.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: {
      exportBatch: { select: { id: true, businessUnitId: true, departmentId: true, createdByMembershipId: true } },
      returnImportBatch: {
        select: {
          exportBatch: { select: { id: true, businessUnitId: true, departmentId: true, createdByMembershipId: true } },
        },
      },
    },
  });
  const batch = artifact?.exportBatch ?? artifact?.returnImportBatch?.exportBatch;
  if (!artifact || !batch) return new Response(null, { status: 404 });
  const access = await checkLogisticsBatchAccess(auth, batch, "logistics.batch_artifact.read");
  if (!access.allowed) return new Response(null, { status: 404 });
  const bytes = await localDemoStorage.get(artifact.storageKey);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename="${artifact.originalName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
