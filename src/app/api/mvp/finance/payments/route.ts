import { FinancePaymentDirection, FinancePaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financePaymentDto } from "@/lib/finance/dto";
import { bodyObject, financeErrorResponse } from "@/lib/finance/http";
import { createPaymentDraft } from "@/lib/finance/settlement-service";
import { prisma } from "@/lib/prisma";

const paymentStatuses = new Set(Object.values(FinancePaymentStatus));
const paymentDirections = new Set(Object.values(FinancePaymentDirection));

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const plan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.payment.read" });
  if (!plan.canAccessPayments) return fail("FORBIDDEN", "当前角色没有查看付款记录的权限。", 403);

  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const statusParam = request.nextUrl.searchParams.get("status");
  const directionParam = request.nextUrl.searchParams.get("direction");
  const counterpartyId = request.nextUrl.searchParams.get("counterpartyId")?.trim();
  if (statusParam && !paymentStatuses.has(statusParam as FinancePaymentStatus)) {
    return fail("INVALID_PAYMENT_STATUS", "付款状态筛选不正确。", 400);
  }
  if (directionParam && !paymentDirections.has(directionParam as FinancePaymentDirection)) {
    return fail("INVALID_PAYMENT_DIRECTION", "收支方向筛选不正确。", 400);
  }

  const filters = {
    legalEntityId: auth.membership.legalEntityId,
    businessUnitId: auth.membership.businessUnitId,
    ...(statusParam ? { status: statusParam as FinancePaymentStatus } : {}),
    ...(directionParam ? { direction: directionParam as FinancePaymentDirection } : {}),
    ...(counterpartyId ? { counterpartyId } : {}),
    ...(query
      ? {
        OR: [
          { paymentNo: { contains: query, mode: "insensitive" as const } },
          { externalReference: { contains: query, mode: "insensitive" as const } },
          { counterparty: { is: { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } } },
        ],
      }
      : {}),
  };
  const where = { AND: [plan.paymentWhere, filters] };
  const include = { counterparty: { select: { id: true, code: true, name: true, type: true } } };
  const [rows, total] = await prisma.$transaction([
    prisma.financePayment.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financePayment.count({ where }),
  ]);
  return paginated(rows.map(financePaymentDto), total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  try {
    const body = bodyObject(await request.json().catch(() => null));
    const row = await createPaymentDraft({ userId: auth.userId, membership: auth.membership }, body);
    return ok(financePaymentDto(row), { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
