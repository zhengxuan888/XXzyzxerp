import { FinanceStatementImportBatchStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, paginated, parsePagination } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financeStatementImportBatchDto } from "@/lib/finance/import-dto";
import { prisma } from "@/lib/prisma";

const importBatchInclude = {
  template: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true, type: true } },
  sheets: { orderBy: [{ sheetKey: "asc" as const }] },
} satisfies Prisma.FinanceStatementImportBatchInclude;

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const plan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.statement_import.read" });
  if (!plan.canAccessStatementImports) return fail("FORBIDDEN", "当前角色没有查看账单导入的权限。", 403);
  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const status = request.nextUrl.searchParams.get("status");
  if (status && !Object.values(FinanceStatementImportBatchStatus).includes(status as FinanceStatementImportBatchStatus)) {
    return fail("INVALID_IMPORT_STATUS", "账单导入状态筛选不正确。", 400);
  }
  const where = {
    AND: [
      plan.importBatchWhere,
      {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        ...(status ? { status: status as FinanceStatementImportBatchStatus } : {}),
        ...(query ? {
          OR: [
            { statementNoPrefix: { contains: query, mode: "insensitive" as const } },
            { originalName: { contains: query, mode: "insensitive" as const } },
            { externalReference: { contains: query, mode: "insensitive" as const } },
            { template: { is: { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } } },
            { counterparty: { is: { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } } },
          ],
        } : {}),
      },
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.financeStatementImportBatch.findMany({
      where,
      include: importBatchInclude,
      orderBy: [{ previewedAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financeStatementImportBatch.count({ where }),
  ]);
  return paginated(rows.map(financeStatementImportBatchDto), total, pagination);
}
