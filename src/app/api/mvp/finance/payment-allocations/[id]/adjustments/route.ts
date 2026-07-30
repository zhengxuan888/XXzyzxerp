import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createAllocationAdjustment } from "@/lib/finance/allocation-adjustment-service";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  try {
    const result = await createAllocationAdjustment(
      { userId: auth.userId, membership: auth.membership },
      id,
      bodyObject(await request.json().catch(() => null)),
    );
    return ok(result.adjustment, { status: result.created ? 201 : 200 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
