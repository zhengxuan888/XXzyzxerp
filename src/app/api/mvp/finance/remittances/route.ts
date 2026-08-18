import { FinanceLineReconciliationStatus, FinanceStatementType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, parsePagination } from "@/lib/api-response";
import { isRemittanceAdministratorRole } from "@/lib/finance/remittance-admin";
import { prisma } from "@/lib/prisma";

const matchStatuses = new Set(Object.values(FinanceLineReconciliationStatus));

function cents(value: bigint) {
  return Number(value) / 100;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  if (!(await isRemittanceAdministratorRole(auth.membership.roleId))) {
    return fail("ADMIN_ONLY", "回款数据仅系统管理员可查看。", 403);
  }

  const pagination = parsePagination(request, 100);
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim().toUpperCase();
  const counterpartyId = request.nextUrl.searchParams.get("counterpartyId")?.trim();
  const matchStatus = request.nextUrl.searchParams.get("matchStatus")?.trim();
  const start = request.nextUrl.searchParams.get("start")?.trim();
  const end = request.nextUrl.searchParams.get("end")?.trim();
  if (matchStatus && !matchStatuses.has(matchStatus as FinanceLineReconciliationStatus)) {
    return fail("INVALID_MATCH_STATUS", "匹配状态不正确。", 400);
  }

  const statementFilter: Prisma.FinanceStatementWhereInput = {
    legalEntityId: auth.membership.legalEntityId,
    businessUnitId: auth.membership.businessUnitId,
    type: FinanceStatementType.COD_REMITTANCE,
    ...(counterpartyId ? { counterpartyId } : {}),
    ...((start || end) ? {
      issuedAt: {
        ...(start ? { gte: new Date(`${start}T00:00:00.000Z`) } : {}),
        ...(end ? { lte: new Date(`${end}T23:59:59.999Z`) } : {}),
      },
    } : {}),
  };
  const where: Prisma.FinanceStatementLineWhereInput = {
    statement: statementFilter,
    ...(matchStatus ? { reconciliationStatus: matchStatus as FinanceLineReconciliationStatus } : {}),
    ...(country ? { order: { is: { recipientCountryCode: country } } } : {}),
    ...(q ? {
      OR: [
        { sourceReference: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { statement: { is: { statementNo: { contains: q, mode: "insensitive" } } } },
        { order: { is: { orderNo: { contains: q, mode: "insensitive" } } } },
        { shipment: { is: { trackingNo: { contains: q, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const [rows, total, groupedAmounts, matched, counterparties, countries] = await prisma.$transaction([
    prisma.financeStatementLine.findMany({
      where,
      include: {
        statement: { include: { counterparty: { select: { id: true, code: true, name: true } } } },
        order: { select: { orderNo: true, recipientName: true, recipientCountryCode: true } },
        shipment: { select: { trackingNo: true } },
      },
      orderBy: [{ statement: { issuedAt: "desc" } }, { statementId: "desc" }, { lineNo: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financeStatementLine.count({ where }),
    prisma.financeStatementLine.groupBy({
      by: ["currency"],
      where,
      orderBy: { currency: "asc" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.financeStatementLine.count({ where: { ...where, reconciliationStatus: FinanceLineReconciliationStatus.MATCHED } }),
    prisma.financeCounterparty.findMany({
      where: { legalEntityId: auth.membership.legalEntityId, businessUnitId: auth.membership.businessUnitId, statements: { some: { type: FinanceStatementType.COD_REMITTANCE } } },
      select: { id: true, code: true, name: true }, orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: { legalEntityId: auth.membership.legalEntityId, businessUnitId: auth.membership.businessUnitId, recipientCountryCode: { not: null }, financeStatementLines: { some: { statement: { type: FinanceStatementType.COD_REMITTANCE } } } },
      distinct: ["recipientCountryCode"], select: { recipientCountryCode: true }, orderBy: { recipientCountryCode: "asc" },
    }),
  ]);

  return ok({
    items: rows.map((row) => ({
      id: row.id,
      statementNo: row.statement.statementNo,
      source: row.statement.counterparty.name,
      receivedAt: row.statement.issuedAt ?? row.statement.periodEnd ?? row.statement.createdAt,
      originalOrderNo: row.order?.orderNo ?? row.sourceReference ?? "未匹配",
      trackingNo: row.shipment?.trackingNo ?? null,
      recipientName: row.order?.recipientName ?? null,
      country: row.order?.recipientCountryCode ?? null,
      amount: cents(row.amountCents),
      currency: row.currency,
      matchStatus: row.reconciliationStatus,
      description: row.description,
    })),
    summary: {
      total,
      matched,
      unmatched: total - matched,
      amounts: groupedAmounts.map((item) => ({
        currency: item.currency,
        amount: cents(item._sum?.amountCents ?? BigInt(0)),
        count: typeof item._count === "object" ? (item._count._all ?? 0) : item._count,
      })),
    },
    filters: { counterparties, countries: countries.map((item) => item.recipientCountryCode).filter(Boolean) },
    pagination: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) },
  });
}
