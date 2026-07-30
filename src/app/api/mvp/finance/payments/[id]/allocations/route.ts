import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { allocatePayment } from "@/lib/finance/settlement-service";
import { serializeMinorAmount } from "@/lib/finance/money";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const result = await allocatePayment({ userId: auth.userId, membership: auth.membership }, id, body);
    const { allocation: row } = result;
    return ok({
      id: row.id,
      paymentId: row.paymentId,
      statementId: row.statementId,
      statementNo: row.statement.statementNo,
      amountCents: serializeMinorAmount(row.amountCents),
      createdByMembershipId: row.createdByMembershipId,
      createdAt: row.createdAt.toISOString(),
      replayed: !result.created,
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
