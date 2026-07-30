import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { financeErrorResponse } from "@/lib/finance/http";
import { findFinanceStatementImportBatch, financeStatementImportBatchDto } from "@/lib/finance/import-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  try {
    const batch = await findFinanceStatementImportBatch({ userId: auth.userId, membership: auth.membership }, id);
    return ok(financeStatementImportBatchDto(batch));
  } catch (error) {
    return financeErrorResponse(error);
  }
}
