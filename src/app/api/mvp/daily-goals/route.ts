import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { canEditGoalMembership, getVisibleGoalMemberships } from "@/lib/daily-goal-access";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  membershipId: z.string().uuid(),
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetOrderCount: z.coerce.number().int().min(0).max(100000),
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

  const { searchParams } = new URL(request.url);
  const { normalized: dateText, date } = parseDate(searchParams.get("date"));
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 20) || 20));
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const departmentId = searchParams.get("departmentId");

  let visible = await getVisibleGoalMemberships({
    id: auth.membership.id,
    userId: auth.userId,
    businessUnitId: auth.membership.businessUnitId,
  });
  if (departmentId) visible = visible.filter((row) => row.departmentId === departmentId);
  if (search) {
    visible = visible.filter((row) =>
      `${row.user.fullName} ${row.user.username} ${row.department?.name ?? ""}`.toLowerCase().includes(search),
    );
  }

  const total = visible.length;
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  const membershipIds = visible.map((row) => row.id);
  const pageMembershipIds = pageRows.map((row) => row.id);
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const [goals, orders, departments] = await Promise.all([
    prisma.dailyGoal.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, membershipId: { in: pageMembershipIds }, goalDate: date },
    }),
    prisma.order.groupBy({
      by: ["ownedByMembershipId", "currency"],
      where: {
        businessUnitId: auth.membership.businessUnitId,
        ownedByMembershipId: { in: membershipIds },
        orderedAt: { gte: date, lt: nextDate },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      _count: { _all: true },
      _sum: { codAmountCents: true },
    }),
    prisma.department.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const goalMap = new Map(goals.map((goal) => [goal.membershipId, goal]));
  const actualMap = new Map<string, { count: number; amountCents: number; currency: string }>();
  for (const row of orders) {
    const current = actualMap.get(row.ownedByMembershipId) ?? { count: 0, amountCents: 0, currency: row.currency };
    current.count += row._count._all;
    current.amountCents += row._sum.codAmountCents ?? 0;
    actualMap.set(row.ownedByMembershipId, current);
  }

  const allGoals = membershipIds.length
    ? await prisma.dailyGoal.findMany({
        where: { businessUnitId: auth.membership.businessUnitId, membershipId: { in: membershipIds }, goalDate: date },
        select: { membershipId: true, targetOrderCount: true, targetAmountCents: true },
      })
    : [];
  const actualCountByMembership = new Map(orders.map((row) => [row.ownedByMembershipId, 0]));
  for (const row of orders) actualCountByMembership.set(row.ownedByMembershipId, (actualCountByMembership.get(row.ownedByMembershipId) ?? 0) + row._count._all);
  const completed = allGoals.filter((goal) => (actualCountByMembership.get(goal.membershipId) ?? 0) >= goal.targetOrderCount).length;

  return NextResponse.json({
    date: dateText,
    rows: pageRows.map((membership) => {
      const goal = goalMap.get(membership.id);
      const actual = actualMap.get(membership.id) ?? { count: 0, amountCents: 0, currency: goal?.currency ?? "EUR" };
      return {
        membershipId: membership.id,
        employeeName: membership.user.fullName,
        username: membership.user.username,
        departmentId: membership.departmentId,
        departmentName: membership.department?.name ?? "未分配部门",
        isSelf: membership.id === auth.membership.id,
        goal: goal
          ? {
              targetOrderCount: goal.targetOrderCount,
              targetAmountCents: goal.targetAmountCents,
              currency: goal.currency,
              note: goal.note,
            }
          : null,
        actual,
      };
    }),
    summary: {
      visibleEmployees: total,
      goalsSet: allGoals.length,
      targetOrderCount: allGoals.reduce((sum, row) => sum + row.targetOrderCount, 0),
      targetAmountCents: allGoals.reduce((sum, row) => sum + row.targetAmountCents, 0),
      completed,
    },
    departments,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", issues: parsed.error.issues }, { status: 400 });

  const target = await prisma.membership.findFirst({
    where: { id: parsed.data.membershipId, isActive: true },
    select: { id: true, userId: true, legalEntityId: true, businessUnitId: true, departmentId: true, siteId: true },
  });
  if (!target) return NextResponse.json({ error: "MEMBERSHIP_NOT_FOUND" }, { status: 404 });
  const allowed = await canEditGoalMembership(
    { id: auth.membership.id, userId: auth.userId, businessUnitId: auth.membership.businessUnitId },
    target,
  );
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const goalDate = new Date(`${parsed.data.goalDate}T00:00:00.000Z`);
  const goal = await prisma.dailyGoal.upsert({
    where: {
      businessUnitId_membershipId_goalDate: {
        businessUnitId: target.businessUnitId,
        membershipId: target.id,
        goalDate,
      },
    },
    update: {
      targetOrderCount: parsed.data.targetOrderCount,
      targetAmountCents: parsed.data.targetAmountCents,
      currency: parsed.data.currency,
      note: parsed.data.note || null,
      setByMembershipId: auth.membership.id,
    },
    create: {
      legalEntityId: target.legalEntityId,
      businessUnitId: target.businessUnitId,
      membershipId: target.id,
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
    module: "daily_goals",
    action: "daily_goal.upsert",
    targetType: "daily_goal",
    targetId: goal.id,
    businessUnitId: target.businessUnitId,
    roleId: auth.membership.roleId,
    details: {
      targetMembershipId: target.id,
      goalDate: parsed.data.goalDate,
      targetOrderCount: parsed.data.targetOrderCount,
      targetAmountCents: parsed.data.targetAmountCents,
      currency: parsed.data.currency,
    },
  });
  return NextResponse.json({ success: true, id: goal.id });
}
