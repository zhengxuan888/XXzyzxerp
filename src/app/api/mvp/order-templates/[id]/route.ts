import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, props: RouteContext<"/api/mvp/order-templates/[id]">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "order_template.manage", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "没有管理订单模板的权限。", 403);
  const { id } = await props.params;
  const current = await prisma.orderTemplate.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId } });
  if (!current) return fail("NOT_FOUND", "订单模板不存在或不属于当前业务板块。", 404);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code.trim().toLocaleUpperCase("en-US") : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!/^[\p{L}\p{N}_-]{2,40}$/u.test(code)) return fail("TEMPLATE_CODE_INVALID", "模板编码需为 2–40 个中英文字母、数字、下划线或短横线，不能包含空格。", 400);
  if (!name || name.length > 80) return fail("TEMPLATE_NAME_INVALID", "模板名称不能为空且不能超过 80 个字符。", 400);
  const conflict = await prisma.orderTemplate.findFirst({ where: { businessUnitId: auth.membership.businessUnitId, code, id: { not: id } }, select: { id: true } });
  if (conflict) return fail("TEMPLATE_CODE_CONFLICT", `模板编码“${code}”已存在，请更换编码。`, 409);
  const configuration = parseOrderTemplateConfiguration(body?.configuration);
  const isDefault = body?.isDefault === true;
  const isActive = body?.isActive !== false;
  if (isDefault && !isActive) return fail("DEFAULT_TEMPLATE_MUST_BE_ACTIVE", "默认模板必须保持启用。", 400);
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.orderTemplate.updateMany({ where: { businessUnitId: auth.membership.businessUnitId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    return tx.orderTemplate.update({
      where: { id },
      data: { code, name, description: typeof body?.description === "string" ? body.description.trim().slice(0, 300) : null, configuration: configuration as unknown as Prisma.InputJsonValue, isDefault, isActive },
    });
  });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.order_templates", action: "order_template.update", targetType: "order_template", targetId: id, businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { previous: { code: current.code, name: current.name, isDefault: current.isDefault, isActive: current.isActive }, next: { code, name, isDefault, isActive } } });
  return ok(updated);
}

export async function DELETE(request: NextRequest, props: RouteContext<"/api/mvp/order-templates/[id]">) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "order_template.manage", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "没有管理订单模板的权限。", 403);
  const { id } = await props.params;
  const template = await prisma.orderTemplate.findFirst({ where: { id, businessUnitId: auth.membership.businessUnitId }, select: { id: true, code: true, isDefault: true, _count: { select: { orders: true } } } });
  if (!template) return fail("NOT_FOUND", "订单模板不存在。", 404);
  if (template.isDefault) return fail("DEFAULT_TEMPLATE_DELETE_FORBIDDEN", "默认模板不能删除，请先把其他模板设为默认。", 409);
  if (template._count.orders > 0) return fail("TEMPLATE_IN_USE", `该模板已被 ${template._count.orders} 个订单使用，只能停用，不能删除。`, 409);
  await prisma.orderTemplate.delete({ where: { id } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.order_templates", action: "order_template.delete", targetType: "order_template", targetId: id, businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { code: template.code } });
  return ok({ deleted: true });
}
