import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseColumnLines, parseCountryRouteLines, parseLogisticsTemplateConfiguration, parseReturnMappingLines } from "@/lib/logistics-provider-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

async function allowed(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>, actionKey: string) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  if (!(await allowed(auth, "logistics_template.read")).allowed) return fail("FORBIDDEN", "无权查看物流商模板。", 403);
  const rows = await prisma.logisticsProviderTemplate.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
  });
  return ok(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  if (!(await allowed(auth, "logistics_template.manage")).allowed) return fail("FORBIDDEN", "无权配置物流商模板。", 403);
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().slice(0, 50) : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const carrierName = typeof body?.carrierName === "string" ? body.carrierName.trim().slice(0, 100) : "";
  const columns = parseColumnLines(typeof body?.columnLines === "string" ? body.columnLines : "");
  if (!code || !name || !carrierName || !columns.length) {
    return fail("TEMPLATE_FIELDS_REQUIRED", "编码、模板名称、物流商和至少一个有效导出字段必填。", 400);
  }
  const configuration = parseLogisticsTemplateConfiguration({
    sheetName: body?.sheetName,
    columns,
    countryRoutes: parseCountryRouteLines(typeof body?.countryRouteLines === "string" ? body.countryRouteLines : ""),
    headerFill: body?.headerFill,
    headerFontColor: body?.headerFontColor,
    returnWorkbook: parseReturnMappingLines(
      typeof body?.returnMappingLines === "string" ? body.returnMappingLines : "",
      body?.returnHeaderScanRows,
    ),
  });
  const row = await prisma.logisticsProviderTemplate.create({
    data: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      code,
      name,
      carrierName,
      configuration,
    },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.templates",
    action: "logistics_template.create",
    targetType: "logistics_provider_template",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { code: row.code, carrierName: row.carrierName },
  });
  return ok(row, { status: 201 });
}
