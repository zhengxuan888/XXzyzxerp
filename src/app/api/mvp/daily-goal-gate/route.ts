import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function dateText() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dateValue() { return new Date(`${dateText()}T00:00:00.000Z`); }
function exempt(roleCode?: string | null) { return ["platform_admin", "business_manager", "legacy_admin", "legacy_ceo"].includes(roleCode ?? ""); }

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const role = await prisma.role.findUnique({ where: { id: auth.membership.roleId }, select: { code: true } });
  const skip = exempt(role?.code);
  const goal = skip ? null : await prisma.dailyGoal.findUnique({ where: { businessUnitId_membershipId_goalDate: { businessUnitId: auth.membership.businessUnitId, membershipId: auth.membership.id, goalDate: dateValue() } }, select: { id: true } });
  return NextResponse.json({ required: !skip, completed: skip || Boolean(goal), date: dateText() });
}

const schema = z.object({ targetOrderCount: z.coerce.number().int().min(1).max(100000), note: z.string().trim().min(1).max(500) });
export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请完整填写今日目标。" }, { status: 400 });
  const goal = await prisma.dailyGoal.upsert({
    where: { businessUnitId_membershipId_goalDate: { businessUnitId: auth.membership.businessUnitId, membershipId: auth.membership.id, goalDate: dateValue() } },
    update: { targetOrderCount: parsed.data.targetOrderCount, note: parsed.data.note, setByMembershipId: auth.membership.id },
    create: { legalEntityId: auth.membership.legalEntityId, businessUnitId: auth.membership.businessUnitId, membershipId: auth.membership.id, goalDate: dateValue(), targetOrderCount: parsed.data.targetOrderCount, note: parsed.data.note, setByMembershipId: auth.membership.id },
  });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "daily_goals", action: "daily_goal.login_gate_submit", targetType: "daily_goal", targetId: goal.id, businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { date: dateText(), targetOrderCount: parsed.data.targetOrderCount } });
  return NextResponse.json({ success: true, id: goal.id });
}
