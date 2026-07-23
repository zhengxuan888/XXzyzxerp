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
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || !name || name.length > 80) {
    return fail("INVALID_TEMPLATE", "模板编码或名称不正确。", 400);
  }
  const configuration = parseOrderTemplateConfiguration(body?.configuration);
  const isDefault = body?.isDefault === true;
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
