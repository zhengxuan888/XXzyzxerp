import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financeStatementDto, financeStatementLineDto } from "@/lib/finance/dto";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, props: Props) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;

  const statementPlan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.statement.read" });
  if (!statementPlan.canAccessStatements) return fail("FORBIDDEN", "当前角色没有查看结算单的权限。", 403);

  const statement = await prisma.financeStatement.findFirst({
    where: {
      AND: [
        statementPlan.statementWhere,
        {
          id,
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
        },
      ],
    },
    include: {
      counterparty: { select: { id: true, code: true, name: true, type: true } },
      _count: { select: { lines: true, paymentAllocations: true } },
    },
  });
  if (!statement) return fail("STATEMENT_NOT_FOUND", "结算单不存在或不在当前授权范围内。", 404);

  const reconciliationPlan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.reconciliation.read" });
  const canReadLines = reconciliationPlan.canAccessStatements && reconciliationPlan.allows({
    businessUnitId: statement.businessUnitId,
    departmentId: statement.departmentId,
    siteId: statement.siteId,
    ownerMembershipId: statement.createdByMembershipId,
  });
  const lines = canReadLines
    ? await prisma.financeStatementLine.findMany({
      where: { statementId: statement.id },
      include: { reconciliations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
      orderBy: [{ lineNo: "asc" }, { id: "asc" }],
    })
    : [];

  return ok({
    ...financeStatementDto(statement),
    lines: lines.map(financeStatementLineDto),
    lineDetailsAvailable: canReadLines,
  });
}
