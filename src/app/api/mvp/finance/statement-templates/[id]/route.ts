import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { financeErrorResponse } from "@/lib/finance/http";
import { financeStatementTemplateDto, updateFinanceStatementTemplate } from "@/lib/finance/import-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteParams) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const row = await updateFinanceStatementTemplate({ userId: auth.userId, membership: auth.membership }, id, input);
    return ok(financeStatementTemplateDto(row));
  } catch (error) {
    return financeErrorResponse(error);
  }
}
