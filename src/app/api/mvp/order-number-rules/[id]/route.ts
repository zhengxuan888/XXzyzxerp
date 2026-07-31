import { NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/api-response";
import { parseOrderNumberRuleInput } from "@/lib/order-numbering";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ id: string }> };
const configurationScopes = ["BUSINESS_UNIT", "ALL"] as const;

async function canManage(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.numbering.manage",
    targetBusinessUnitId: auth.membership.businessUnitId,
    allowedScopes: configurationScopes,
  });
}

async function validateReferences(input: ReturnType<typeof parseOrderNumberRuleInput>["value"], auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  const [department, orderTemplate] = await Promise.all([
    input.departmentId
      ? prisma.department.findFirst({
          where: { id: input.departmentId, businessUnitId: auth.membership.businessUnitId, isActive: true },
          select: { id: true },
        })
      : null,
    input.orderTemplateId
      ? prisma.orderTemplate.findFirst({
          where: { id: input.orderTemplateId, businessUnitId: auth.membership.businessUnitId, isActive: true },
          select: { id: true },
        })
      : null,
  ]);
  if (input.departmentId && !department) return "指定部门不存在、已停用或不属于当前业务板块。";
  if (input.orderTemplateId && !orderTemplate) return "指定订单模板不存在、已停用或不属于当前业务板块。";
  if (input.isDefault && !input.isActive) return "默认订单编号规则必须保持启用。";
  return null;
}

export async function PATCH(request: NextRequest, props: RouteProps) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canManage(auth);
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置订单编号规则的权限。", 403, { reasons: permission.reasons });
  const { id } = await props.params;
  const current = await prisma.orderNumberRule.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
  });
  if (!current) return fail("NOT_FOUND", "订单编号规则不存在或不属于当前业务板块。", 404);

  const body = await request.json().catch(() => null);
  const parsed = parseOrderNumberRuleInput(body);
  if (parsed.errors.length > 0) return fail("INVALID_ORDER_NUMBER_RULE", parsed.errors.join(" "), 400, { errors: parsed.errors });
  const referenceError = await validateReferences(parsed.value, auth);
  if (referenceError) return fail("INVALID_ORDER_NUMBER_RULE_REFERENCE", referenceError, 400);
  if (current.isDefault && (!parsed.value.isDefault || !parsed.value.isActive)) {
    return fail("DEFAULT_ORDER_NUMBER_RULE_REQUIRED", "请先将另一条启用规则设为默认，再停用或取消当前默认规则。", 409);
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (parsed.value.isDefault) {
        await tx.orderNumberRule.updateMany({
          where: { businessUnitId: auth.membership.businessUnitId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.orderNumberRule.update({
        where: { id },
        data: {
          departmentId: parsed.value.departmentId,
          orderTemplateId: parsed.value.orderTemplateId,
          code: parsed.value.code,
          name: parsed.value.name,
          prefix: parsed.value.prefix,
          dateFormat: parsed.value.dateFormat,
          timeZone: parsed.value.timeZone,
          includeDepartmentCode: parsed.value.includeDepartmentCode,
          separator: parsed.value.separator,
          sequencePadding: parsed.value.sequencePadding,
          resetPeriod: parsed.value.resetPeriod,
          priority: parsed.value.priority,
          isDefault: parsed.value.isDefault,
          isActive: parsed.value.isActive,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("ORDER_NUMBER_RULE_CONFLICT", "当前业务板块已存在相同的订单编号规则编码，请更换规则编码后重试。", 409);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.order_numbering",
    action: "order.numbering.update",
    targetType: "order_number_rule",
    targetId: updated.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      previous: { code: current.code, isDefault: current.isDefault, isActive: current.isActive, departmentId: current.departmentId, orderTemplateId: current.orderTemplateId },
      next: { code: updated.code, isDefault: updated.isDefault, isActive: updated.isActive, departmentId: updated.departmentId, orderTemplateId: updated.orderTemplateId },
    },
  });
  return ok(updated);
}

export async function DELETE(request: NextRequest, props: RouteProps) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canManage(auth);
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置订单编号规则的权限。", 403, { reasons: permission.reasons });
  const { id } = await props.params;
  const current = await prisma.orderNumberRule.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    include: { _count: { select: { orders: true, counters: true } } },
  });
  if (!current) return fail("NOT_FOUND", "订单编号规则不存在或不属于当前业务板块。", 404);
  if (current.isDefault) return fail("DEFAULT_ORDER_NUMBER_RULE_DELETE_FORBIDDEN", "默认规则不能删除，请先设置其他默认规则。", 409);
  if (current._count.orders > 0 || current._count.counters > 0) {
    return fail("ORDER_NUMBER_RULE_IN_USE", "这条规则已经产生订单或流水记录，为保持审计可追溯性只能停用，不能删除。", 409);
  }
  await prisma.orderNumberRule.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.order_numbering",
    action: "order.numbering.delete",
    targetType: "order_number_rule",
    targetId: current.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { code: current.code },
  });
  return ok({ deleted: true });
}
