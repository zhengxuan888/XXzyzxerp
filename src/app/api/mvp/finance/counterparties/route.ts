import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financeCounterpartyDto } from "@/lib/finance/dto";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { createCounterparty } from "@/lib/finance/settlement-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const plan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.counterparty.read" });
  if (!plan.canAccessCounterparties) return fail("FORBIDDEN", "当前角色没有查看结算对象的权限。", 403);

  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const active = request.nextUrl.searchParams.get("active");
  const filters = {
    legalEntityId: auth.membership.legalEntityId,
    businessUnitId: auth.membership.businessUnitId,
    ...(active === "true" ? { isActive: true } : active === "false" ? { isActive: false } : {}),
    ...(query
      ? { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] }
      : {}),
  };
  const where = { AND: [plan.counterpartyWhere, filters] };
  const [rows, total] = await prisma.$transaction([
    prisma.financeCounterparty.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financeCounterparty.count({ where }),
  ]);
  return paginated(rows.map(financeCounterpartyDto), total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const row = await createCounterparty({ userId: auth.userId, membership: auth.membership }, body);
    return ok(financeCounterpartyDto(row), { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
