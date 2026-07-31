import { NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/api-response";
import { parseOrderNumberRuleInput } from "@/lib/order-numbering";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const configurationScopes = ["BUSINESS_UNIT", "ALL"] as const;

async function canUseNumberingConfiguration(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>, actionKey: string) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
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

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canUseNumberingConfiguration(auth, "order.numbering.read");
  if (!permission.allowed) return fail("FORBIDDEN", "没有查看订单编号规则的权限。", 403, { reasons: permission.reasons });

  const rows = await prisma.orderNumberRule.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    include: {
      department: { select: { id: true, code: true, name: true } },
      orderTemplate: { select: { id: true, code: true, name: true } },
      _count: { select: { orders: true } },
    },
    orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
  return ok(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canUseNumberingConfiguration(auth, "order.numbering.manage");
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置订单编号规则的权限。", 403, { reasons: permission.reasons });

  const body = await request.json().catch(() => null);
  const parsed = parseOrderNumberRuleInput(body);
  if (parsed.errors.length > 0) return fail("INVALID_ORDER_NUMBER_RULE", parsed.errors.join(" "), 400, { errors: parsed.errors });
  const referenceError = await validateReferences(parsed.value, auth);
  if (referenceError) return fail("INVALID_ORDER_NUMBER_RULE_REFERENCE", referenceError, 400);

  let rule;
  try {
    rule = await prisma.$transaction(async (tx) => {
      if (parsed.value.isDefault) {
        await tx.orderNumberRule.updateMany({
          where: { businessUnitId: auth.membership.businessUnitId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.orderNumberRule.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
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
    action: "order.numbering.create",
    targetType: "order_number_rule",
    targetId: rule.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { code: rule.code, isDefault: rule.isDefault, departmentId: rule.departmentId, orderTemplateId: rule.orderTemplateId },
  });
  return ok(rule, { status: 201 });
}
