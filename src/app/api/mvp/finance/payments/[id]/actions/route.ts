import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { financePaymentDto } from "@/lib/finance/dto";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { transitionPayment } from "@/lib/finance/settlement-service";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const row = await transitionPayment({ userId: auth.userId, membership: auth.membership }, id, body);
    return ok(financePaymentDto(row));
  } catch (error) {
    return financeErrorResponse(error);
  }
}
