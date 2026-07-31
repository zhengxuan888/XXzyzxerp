import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission, normalizeScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSystemConfigurationPermission } from "@/lib/system-configuration";

const levels = { NONE: 0, SELF: 1, SITE: 2, DEPARTMENT: 2, DEPARTMENT_TREE: 2, SUBORDINATES: 2, BUSINESS_UNIT: 3, ALL: 4 } as const;
type Props = { params: Promise<{ id: string }> };

async function context(request: NextRequest, id: string) {
  const auth = await requireAuthContext(request);
  if (!auth) return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  const systemConfiguration = await getSystemConfigurationPermission(auth);
  if (!systemConfiguration.allowed) return { response: NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 }) };
  const rule = await prisma.delegationRule.findUnique({ where: { id }, include: { role: true } });
  if (!rule) return { response: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "delegation.manage", targetBusinessUnitId: auth.membership.businessUnitId, targetDepartmentId: auth.membership.departmentId });
  if (!permission.allowed) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { auth, rule };
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const result = await context(request, id);
  if ("response" in result) return result.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  if ((typeof body.roleId === "string" && body.roleId !== result.rule.roleId) || (typeof body.actionKey === "string" && body.actionKey !== result.rule.actionKey)) return NextResponse.json({ error: "角色和动作不可直接修改，请关闭后新建。" }, { status: 400 });
  const maxScope = normalizeScope(typeof body.maxScope === "string" ? body.maxScope : result.rule.maxScope);
  const rolePermission = await prisma.rolePermission.findUnique({ where: { roleId_actionKey: { roleId: result.rule.roleId, actionKey: result.rule.actionKey } } });
  if (!rolePermission?.isAllowed || maxScope === "NONE" || levels[maxScope] > levels[normalizeScope(rolePermission.scope)]) return NextResponse.json({ error: "转授范围超过角色自身权限。" }, { status: 400 });
  const row = await prisma.delegationRule.update({ where: { id }, data: { maxScope, canTransfer: body.canTransfer === true } });
  await writeAuditLog({ actorUserId: result.auth.userId, actorMembershipId: result.auth.membership.id, module: "admin.delegation-rules", action: "delegation_rule.update", targetType: "delegation_rule", targetId: row.id, roleId: result.auth.membership.roleId, details: { previous: result.rule, next: row } });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const result = await context(request, id);
  if ("response" in result) return result.response;
  const row = await prisma.delegationRule.update({ where: { id }, data: { canTransfer: false } });
  await writeAuditLog({ actorUserId: result.auth.userId, actorMembershipId: result.auth.membership.id, module: "admin.delegation-rules", action: "delegation_rule.disable", targetType: "delegation_rule", targetId: row.id, roleId: result.auth.membership.roleId });
  return NextResponse.json({ ok: true, disabled: row.id });
}
