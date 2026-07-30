import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { cancelFinanceStatementImport, financeStatementImportBatchDto } from "@/lib/finance/import-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  const body = bodyObject(await request.json().catch(() => null));
  try {
    const result = await cancelFinanceStatementImport(
      { userId: auth.userId, membership: auth.membership },
      id,
      { reason: body.reason },
    );
    return ok({ ...financeStatementImportBatchDto(result.batch), idempotent: result.idempotent });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
