import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scopeType: z.enum(["BUSINESS_UNIT", "DEPARTMENT"]),
  departmentId: z.string().uuid().optional().nullable(),
  targetOrderCount: z.coerce.number().int().min(0).max(1000000),
  targetAmountCents: z.coerce.number().int().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  note: z.string().trim().max(500).optional().nullable(),
});

function parseDate(value: string | null) {
  const normalized = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
  return { normalized, date: new Date(`${normalized}T00:00:00.000Z`) };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const read = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "team_goal.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!read.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { normalized: dateText, date } = parseDate(request.nextUrl.searchParams.get("date"));
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const manage = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "team_goal.manage",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });

  const [goals, departments, dailyGoals, orders] = await Promise.all([
    prisma.teamGoal.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, goalDate: date },
      include: { department: { select: { name: true } } },
      orderBy: [{ scopeType: "asc" }, { department: { sortOrder: "asc" } }],
    }),
    prisma.department.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.dailyGoal.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, goalDate: date },
      select: {
        targetOrderCount: true,
        targetAmountCents: true,
        membership: { select: { departmentId: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
        orderedAt: { gte: date, lt: nextDate },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      select: { departmentId: true, codAmountCents: true, currency: true },
    }),
  ]);

  function totals(departmentId: string | null) {
    const assignedRows = departmentId
      ? dailyGoals.filter((row) => row.membership.departmentId === departmentId)
      : dailyGoals;
    const actualRows = departmentId
      ? orders.filter((row) => row.departmentId === departmentId)
      : orders;
    return {
      assignedOrderCount: assignedRows.reduce((sum, row) => sum + row.targetOrderCount, 0),
      assignedAmountCents: assignedRows.reduce((sum, row) => sum + row.targetAmountCents, 0),
      actualOrderCount: actualRows.length,
      actualAmountCents: actualRows.reduce((sum, row) => sum + row.codAmountCents, 0),
    };
  }

  return NextResponse.json({
    date: dateText,
    canManage: manage.allowed,
    departments,
    rows: goals.map((goal) => ({
      id: goal.id,
      scopeType: goal.scopeType,
      departmentId: goal.departmentId,
      scopeName: goal.department?.name ?? "当前业务板块",
      targetOrderCount: goal.targetOrderCount,
      targetAmountCents: goal.targetAmountCents,
      currency: goal.currency,
      note: goal.note,
      ...totals(goal.departmentId),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", issues: parsed.error.issues }, { status: 400 });

  const department = parsed.data.scopeType === "DEPARTMENT"
    ? await prisma.department.findFirst({
        where: {
          id: parsed.data.departmentId ?? "",
          businessUnitId: auth.membership.businessUnitId,
          isActive: true,
        },
        select: { id: true },
      })
    : null;
  if (parsed.data.scopeType === "DEPARTMENT" && !department) {
    return NextResponse.json({ error: "DEPARTMENT_NOT_FOUND" }, { status: 404 });
  }

  const allowed = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "team_goal.manage",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: department?.id ?? null,
  });
  if (!allowed.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const goalDate = new Date(`${parsed.data.goalDate}T00:00:00.000Z`);
  const scopeKey = department ? `DEPARTMENT:${department.id}` : "BUSINESS_UNIT";
  const goal = await prisma.teamGoal.upsert({
    where: {
      businessUnitId_scopeKey_goalDate: {
        businessUnitId: auth.membership.businessUnitId,
        scopeKey,
        goalDate,
      },
    },
    update: {
      departmentId: department?.id ?? null,
      scopeType: parsed.data.scopeType,
      targetOrderCount: parsed.data.targetOrderCount,
      targetAmountCents: parsed.data.targetAmountCents,
      currency: parsed.data.currency,
      note: parsed.data.note || null,
      setByMembershipId: auth.membership.id,
    },
    create: {
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      departmentId: department?.id ?? null,
      scopeType: parsed.data.scopeType,
      scopeKey,
      goalDate,
      targetOrderCount: parsed.data.targetOrderCount,
      targetAmountCents: parsed.data.targetAmountCents,
      currency: parsed.data.currency,
      note: parsed.data.note || null,
      setByMembershipId: auth.membership.id,
    },
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "team_goals",
    action: "team_goal.upsert",
    targetType: "team_goal",
    targetId: goal.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      scopeType: parsed.data.scopeType,
      departmentId: department?.id ?? null,
      goalDate: parsed.data.goalDate,
      targetOrderCount: parsed.data.targetOrderCount,
      targetAmountCents: parsed.data.targetAmountCents,
      currency: parsed.data.currency,
    },
  });
  return NextResponse.json({ success: true, id: goal.id });
}
