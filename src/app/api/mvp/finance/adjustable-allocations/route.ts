import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, paginated, parsePagination } from "@/lib/api-response";
import { listAdjustableAllocations } from "@/lib/finance/allocation-adjustment-service";
import { financeErrorResponse } from "@/lib/finance/http";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  try {
    const pagination = parsePagination(request);
    const result = await listAdjustableAllocations(
      { userId: auth.userId, membership: auth.membership },
      { page: pagination.page, pageSize: pagination.pageSize, query: request.nextUrl.searchParams.get("q") },
    );
    return paginated(result.items, result.total, pagination);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
