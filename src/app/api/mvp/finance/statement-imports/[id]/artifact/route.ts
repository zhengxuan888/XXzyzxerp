import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { findFinanceStatementImportBatch } from "@/lib/finance/import-service";
import { FinanceServiceError } from "@/lib/finance/settlement-service";
import { localDemoStorage } from "@/lib/storage/local-demo";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return new Response(null, { status: 401 });
  const { id } = await context.params;
  try {
    const batch = await findFinanceStatementImportBatch({ userId: auth.userId, membership: auth.membership }, id, "finance.statement_artifact.read");
    const bytes = await localDemoStorage.get(batch.storageKey);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(bytes, {
      headers: {
        "Content-Type": batch.mimeType,
        "Content-Disposition": `attachment; filename="${batch.originalName.replace(/[^\\w.-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FinanceServiceError && error.status === 404) return new Response(null, { status: 404 });
    return new Response(null, { status: 403 });
  }
}
