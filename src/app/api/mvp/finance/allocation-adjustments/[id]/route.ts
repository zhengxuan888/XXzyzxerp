import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { getAllocationAdjustment } from "@/lib/finance/allocation-adjustment-service";
import { financeErrorResponse } from "@/lib/finance/http";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  try {
    return ok(await getAllocationAdjustment({ userId: auth.userId, membership: auth.membership }, id));
  } catch (error) {
    return financeErrorResponse(error);
  }
}
