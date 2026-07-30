import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, paginated, parsePagination } from "@/lib/api-response";
import { listReplacementStatementOptions } from "@/lib/finance/allocation-adjustment-service";
import { financeErrorResponse } from "@/lib/finance/http";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  try {
    const pagination = parsePagination(request);
    const result = await listReplacementStatementOptions(
      { userId: auth.userId, membership: auth.membership },
      id,
      { page: pagination.page, pageSize: pagination.pageSize, query: request.nextUrl.searchParams.get("q") },
    );
    return paginated(result.statements, result.total, pagination);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
