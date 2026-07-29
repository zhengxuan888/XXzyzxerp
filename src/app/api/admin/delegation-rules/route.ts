import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission, normalizeScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const levels = { NONE: 0, SELF: 1, SITE: 2, DEPARTMENT: 2, DEPARTMENT_TREE: 2, SUBORDINATES: 2, BUSINESS_UNIT: 3, ALL: 4 } as const;

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "delegation.manage", targetBusinessUnitId: auth.membership.businessUnitId, targetDepartmentId: auth.membership.departmentId });
  if (!permission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: permission.reasons }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.roleId !== "string" || typeof body.actionKey !== "string") return NextResponse.json({ error: "角色和动作不能为空。" }, { status: 400 });
  if (!permission.reasons.includes("SCOPE_ALL") && body.roleId !== auth.membership.roleId) return NextResponse.json({ error: "只能配置当前角色的转授规则。" }, { status: 403 });
  const maxScope = normalizeScope(typeof body.maxScope === "string" ? body.maxScope : null);
  if (maxScope === "NONE") return NextResponse.json({ error: "最大范围无效。" }, { status: 400 });
  const rolePermission = await prisma.rolePermission.findUnique({ where: { roleId_actionKey: { roleId: body.roleId, actionKey: body.actionKey } } });
  if (!rolePermission?.isAllowed) return NextResponse.json({ error: "该角色本身没有此动作，不能转授。" }, { status: 400 });
  if (levels[maxScope] > levels[normalizeScope(rolePermission.scope)]) return NextResponse.json({ error: "转授范围不能超过角色自身范围。" }, { status: 400 });
  if (await prisma.delegationRule.findUnique({ where: { roleId_actionKey: { roleId: body.roleId, actionKey: body.actionKey } } })) return NextResponse.json({ error: "该角色的动作规则已存在，请直接编辑。" }, { status: 409 });
  const row = await prisma.delegationRule.create({ data: { roleId: body.roleId, actionKey: body.actionKey, maxScope, canTransfer: body.canTransfer === true } });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.delegation-rules", action: "delegation_rule.create", targetType: "delegation_rule", targetId: row.id, roleId: auth.membership.roleId, details: row });
  return NextResponse.json(row);
}
