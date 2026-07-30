import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { createFinanceAccessPlan } from "@/lib/finance/access";
import { financeErrorResponse } from "@/lib/finance/http";
import { createFinanceStatementTemplate, financeStatementTemplateDto } from "@/lib/finance/import-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const plan = await createFinanceAccessPlan({ membership: auth.membership, actionKey: "finance.statement_template.read" });
  if (!plan.canAccessImportTemplates) return fail("FORBIDDEN", "当前角色没有查看账单模板的权限。", 403);

  const pagination = parsePagination(request);
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const active = request.nextUrl.searchParams.get("active");
  const where = {
    AND: [
      plan.importTemplateWhere,
      {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        ...(active === "true" ? { isActive: true } : active === "false" ? { isActive: false } : {}),
        ...(query ? {
          OR: [
            { code: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } },
          ],
        } : {}),
      },
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.financeStatementTemplate.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.financeStatementTemplate.count({ where }),
  ]);
  return paginated(rows.map(financeStatementTemplateDto), total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  try {
    const body = await request.json().catch(() => null);
    const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const row = await createFinanceStatementTemplate({ userId: auth.userId, membership: auth.membership }, input);
    return ok(financeStatementTemplateDto(row), { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
