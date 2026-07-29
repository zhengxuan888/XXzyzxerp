import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order_template.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有查看订单模板的权限。", 403);
  const rows = await prisma.orderTemplate.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return ok(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order_template.manage",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有管理订单模板的权限。", 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code.trim().toLocaleUpperCase("en-US") : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!code) return fail("TEMPLATE_CODE_REQUIRED", "请填写模板编码。", 400);
  if (!/^[\p{L}\p{N}_-]{2,40}$/u.test(code)) return fail("TEMPLATE_CODE_INVALID", "模板编码需为 2–40 个中英文字母、数字、下划线或短横线，不能包含空格。", 400);
  if (!name) return fail("TEMPLATE_NAME_REQUIRED", "请填写模板名称。", 400);
  if (name.length > 80) return fail("TEMPLATE_NAME_TOO_LONG", "模板名称不能超过 80 个字符。", 400);
  const configuration = parseOrderTemplateConfiguration(body?.configuration);
  const isDefault = body?.isDefault === true;
  const existing = await prisma.orderTemplate.findUnique({
    where: { businessUnitId_code: { businessUnitId: auth.membership.businessUnitId, code } },
    select: { id: true },
  });
  if (existing) return fail("TEMPLATE_CODE_CONFLICT", `模板编码“${code}”已存在，请更换编码。`, 409);
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.orderTemplate.updateMany({
        where: { businessUnitId: auth.membership.businessUnitId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.orderTemplate.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        code,
        name,
        description: typeof body?.description === "string" ? body.description.trim().slice(0, 300) : null,
        configuration: configuration as unknown as Prisma.InputJsonValue,
        isDefault,
        isActive: body?.isActive !== false,
      },
    });
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.order_templates",
    action: "order_template.create",
    targetType: "order_template",
    targetId: created.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { code, name, isDefault },
  });
  return ok(created, { status: 201 });
}
