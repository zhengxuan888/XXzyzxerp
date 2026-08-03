import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseColumnLines, parseCountryRouteLines, parseLogisticsTemplateConfiguration, parseReturnMappingLines } from "@/lib/logistics-provider-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, props: RouteContext<"/api/mvp/logistics-templates/[id]">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "logistics_template.manage", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "无权配置物流商模板。", 403);
  const { id } = await props.params;
  const current = await prisma.logisticsProviderTemplate.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
  if (!current) return fail("NOT_FOUND", "物流商模板不存在。", 404);
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toLocaleUpperCase("en-US").slice(0, 50) : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const carrierName = typeof body?.carrierName === "string" ? body.carrierName.trim().slice(0, 100) : "";
  const columns = parseColumnLines(typeof body?.columnLines === "string" ? body.columnLines : "");
  if (!code || !name || !carrierName || !columns.length) return fail("TEMPLATE_FIELDS_REQUIRED", "编码、模板名称、物流商和至少一个有效导出字段必填。", 400);
  const conflict = await prisma.logisticsProviderTemplate.findFirst({ where: { businessUnitId: auth.membership.businessUnitId, code, id: { not: id } }, select: { id: true } });
  if (conflict) return fail("TEMPLATE_CODE_CONFLICT", `模板编码“${code}”已存在。`, 409);
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
  const updated = await prisma.logisticsProviderTemplate.update({
    where: { id },
    data: {
      code,
      name,
      carrierName,
      configuration: configuration as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
      isActive: body?.isActive === true || body?.isActive === "on",
    },
  });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "logistics.templates", action: "logistics_template.update", targetType: "logistics_provider_template", targetId: id, businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { previous: { code: current.code, name: current.name, isActive: current.isActive, version: current.version }, next: { code, name, isActive: updated.isActive, version: updated.version } } });
  return ok(updated);
}

export async function DELETE(request: NextRequest, props: RouteContext<"/api/mvp/logistics-templates/[id]">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "logistics_template.manage",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "无权删除物流商模板。", 403);

  const { id } = await props.params;
  const current = await prisma.logisticsProviderTemplate.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { _count: { select: { exportBatches: true } } },
  });
  if (!current) return fail("NOT_FOUND", "物流商模板不存在。", 404);
  if (current._count.exportBatches > 0) {
    const archivedAt = new Date();
    await prisma.logisticsProviderTemplate.update({
      where: { id },
      data: {
        archivedAt,
        isActive: false,
        code: `${current.code.slice(0, 29)}__ARCHIVED__${archivedAt.getTime()}`.slice(0, 50),
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "logistics.templates",
      action: "logistics_template.archive",
      targetType: "logistics_provider_template",
      targetId: id,
      businessUnitId: auth.membership.businessUnitId,
      roleId: auth.membership.roleId,
      details: { code: current.code, name: current.name, version: current.version, exportBatchCount: current._count.exportBatches },
    });
    return ok({ id, deleted: true, archived: true });
  }

  await prisma.logisticsProviderTemplate.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "logistics.templates",
    action: "logistics_template.delete",
    targetType: "logistics_provider_template",
    targetId: id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { code: current.code, name: current.name, version: current.version },
  });
  return ok({ id, deleted: true });
}
