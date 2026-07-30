import { FinanceStatementStatus, FinanceStatementType } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financeStatementDto } from "@/lib/finance/dto";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { createStatementDraft } from "@/lib/finance/settlement-service";
import { prisma } from "@/lib/prisma";

const statementStatuses = new Set(Object.values(FinanceStatementStatus));
const statementTypes = new Set(Object.values(FinanceStatementType));

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const plan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.statement.read" });
  if (!plan.canAccessStatements) return fail("FORBIDDEN", "当前角色没有查看结算单的权限。", 403);

  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const statusParam = request.nextUrl.searchParams.get("status");
  const typeParam = request.nextUrl.searchParams.get("type");
  const counterpartyId = request.nextUrl.searchParams.get("counterpartyId")?.trim();
  if (statusParam && !statementStatuses.has(statusParam as FinanceStatementStatus)) {
    return fail("INVALID_STATEMENT_STATUS", "结算单状态筛选不正确。", 400);
  }
  if (typeParam && !statementTypes.has(typeParam as FinanceStatementType)) {
    return fail("INVALID_STATEMENT_TYPE", "结算类型筛选不正确。", 400);
  }

  const filters = {
    legalEntityId: auth.membership.legalEntityId,
    businessUnitId: auth.membership.businessUnitId,
    ...(statusParam ? { status: statusParam as FinanceStatementStatus } : {}),
    ...(typeParam ? { type: typeParam as FinanceStatementType } : {}),
    ...(counterpartyId ? { counterpartyId } : {}),
    ...(query
      ? {
        OR: [
          { statementNo: { contains: query, mode: "insensitive" as const } },
          { externalReference: { contains: query, mode: "insensitive" as const } },
          { counterparty: { is: { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } } },
        ],
      }
      : {}),
  };
  const where = { AND: [plan.statementWhere, filters] };
  const include = {
    counterparty: { select: { id: true, code: true, name: true, type: true } },
    _count: { select: { lines: true, paymentAllocations: true } },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.financeStatement.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financeStatement.count({ where }),
  ]);
  return paginated(rows.map(financeStatementDto), total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const row = await createStatementDraft({ userId: auth.userId, membership: auth.membership }, body);
    return ok(financeStatementDto(row), { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
