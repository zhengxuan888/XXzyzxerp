import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { financeReconciliationDto } from "@/lib/finance/dto";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { createReconciliation } from "@/lib/finance/settlement-service";

type Props = { params: Promise<{ id: string; lineId: string }> };

export async function POST(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id, lineId } = await props.params;

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const row = await createReconciliation({ userId: auth.userId, membership: auth.membership }, id, lineId, body);
    return ok(financeReconciliationDto(row), { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
