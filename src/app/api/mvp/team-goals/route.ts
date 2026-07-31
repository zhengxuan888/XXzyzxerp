import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getTeamGoalAccess } from "@/lib/team-goal-access";

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

  const { normalized: dateText, date } = parseDate(request.nextUrl.searchParams.get("date"));
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const access = await getTeamGoalAccess({
    id: auth.membership.id,
    userId: auth.userId,
    businessUnitId: auth.membership.businessUnitId,
  });
  const canRead = access.canReadBusinessUnit
    || access.readableDepartmentIds.size > 0
    || access.readableMembershipIds.size > 0;
  if (!canRead) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const readableDepartmentIds = [...access.readableDepartmentIds];
  const visibleGoalScopes = [
    ...(access.canReadBusinessUnit ? [{ scopeType: "BUSINESS_UNIT" as const }] : []),
    ...(readableDepartmentIds.length
      ? [{ scopeType: "DEPARTMENT" as const, departmentId: { in: readableDepartmentIds } }]
      : []),
  ];
  const goals = visibleGoalScopes.length
    ? await prisma.teamGoal.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
        goalDate: date,
        OR: visibleGoalScopes,
      },
      include: { department: { select: { name: true } } },
      orderBy: [{ scopeType: "asc" }, { department: { sortOrder: "asc" } }],
    })
    : [];

  const memberIdsByDepartment = new Map<string, string[]>();
  for (const membership of access.memberships) {
    if (!membership.departmentId) continue;
    memberIdsByDepartment.set(membership.departmentId, [
      ...(memberIdsByDepartment.get(membership.departmentId) ?? []),
      membership.id,
    ]);
  }
  const activeMembershipIds = access.memberships.map((membership) => membership.id);
  const relevantMembershipIds = new Set<string>();
  for (const goal of goals) {
    const memberIds = goal.scopeType === "BUSINESS_UNIT"
      ? activeMembershipIds
      : (goal.departmentId ? memberIdsByDepartment.get(goal.departmentId) ?? [] : []);
    memberIds.forEach((id) => relevantMembershipIds.add(id));
  }
  const membershipIdList = [...relevantMembershipIds];

  const [dailyGoals, orders] = await Promise.all([
    membershipIdList.length
      ? prisma.dailyGoal.findMany({
        where: {
          businessUnitId: auth.membership.businessUnitId,
          membershipId: { in: membershipIdList },
          goalDate: date,
        },
        select: { membershipId: true, targetOrderCount: true, targetAmountCents: true },
      })
      : Promise.resolve([]),
    membershipIdList.length
      ? prisma.order.findMany({
        where: {
          businessUnitId: auth.membership.businessUnitId,
          ownedByMembershipId: { in: membershipIdList },
          orderedAt: { gte: date, lt: nextDate },
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        select: { ownedByMembershipId: true, codAmountCents: true, currency: true },
      })
      : Promise.resolve([]),
  ]);

  function totals(goal: (typeof goals)[number]) {
    const scopeMembershipIds = new Set(goal.scopeType === "BUSINESS_UNIT"
      ? activeMembershipIds
      : (goal.departmentId ? memberIdsByDepartment.get(goal.departmentId) ?? [] : []));
    const assignedRows = dailyGoals.filter((row) => scopeMembershipIds.has(row.membershipId));
    const actualRows = orders.filter((row) => scopeMembershipIds.has(row.ownedByMembershipId));
    return {
      assignedOrderCount: assignedRows.reduce((sum, row) => sum + row.targetOrderCount, 0),
      assignedAmountCents: assignedRows.reduce((sum, row) => sum + row.targetAmountCents, 0),
      actualOrderCount: actualRows.length,
      actualAmountCents: actualRows.reduce((sum, row) => sum + row.codAmountCents, 0),
    };
  }

  return NextResponse.json({
    date: dateText,
    canManage: access.canManageBusinessUnit || access.manageableDepartmentIds.size > 0,
    canManageBusinessUnit: access.canManageBusinessUnit,
    departments: access.departments.filter((department) => access.manageableDepartmentIds.has(department.id)),
    rows: goals.map((goal) => ({
      id: goal.id,
      scopeType: goal.scopeType,
      departmentId: goal.departmentId,
      scopeName: goal.department?.name ?? "当前业务板块",
      targetOrderCount: goal.targetOrderCount,
      targetAmountCents: goal.targetAmountCents,
      currency: goal.currency,
      note: goal.note,
      ...totals(goal),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", issues: parsed.error.issues }, { status: 400 });

  const access = await getTeamGoalAccess({
    id: auth.membership.id,
    userId: auth.userId,
    businessUnitId: auth.membership.businessUnitId,
  });
  const department = parsed.data.scopeType === "DEPARTMENT"
    ? access.departments.find((row) => row.id === parsed.data.departmentId) ?? null
    : null;
  if (parsed.data.scopeType === "DEPARTMENT" && !department) {
    return NextResponse.json({ error: "DEPARTMENT_NOT_FOUND" }, { status: 404 });
  }

  const allowed = department
    ? access.manageableDepartmentIds.has(department.id)
    : access.canManageBusinessUnit;
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

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
