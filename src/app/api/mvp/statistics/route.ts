import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

function dateParam(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const selfDecision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "report.view",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetUserId: auth.userId,
  });
  if (!selfDecision.allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const url = new URL(request.url);
  const now = new Date();
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultStart = new Date(defaultEnd.getTime() - 29 * DAY);
  const start = dateParam(url.searchParams.get("start"), defaultStart);
  const endDate = dateParam(url.searchParams.get("end"), defaultEnd);
  if (endDate < start || endDate.getTime() - start.getTime() > 366 * DAY) {
    return NextResponse.json({ error: "INVALID_DATE_RANGE" }, { status: 400 });
  }
  const endExclusive = new Date(endDate.getTime() + DAY);
  const requestedDepartmentId = url.searchParams.get("departmentId") || null;
  const requestedMembershipId = url.searchParams.get("membershipId") || null;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 20) || 20));

  const candidates = await prisma.membership.findMany({
    where: {
      businessUnitId: auth.membership.businessUnitId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      siteId: true,
      user: { select: { fullName: true, username: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ department: { sortOrder: "asc" } }, { user: { fullName: "asc" } }],
  });

  const visibility = await Promise.all(candidates.map(async (candidate) => {
    if (candidate.id === auth.membership.id) return true;
    const decision = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "report.team.view",
      targetBusinessUnitId: auth.membership.businessUnitId,
      targetDepartmentId: candidate.departmentId,
      targetSiteId: candidate.siteId,
      targetUserId: candidate.userId,
    });
    return decision.allowed;
  }));
  const visible = candidates.filter((_, index) => visibility[index]);
  const filtered = visible.filter((membership) =>
    (!requestedDepartmentId || membership.departmentId === requestedDepartmentId)
    && (!requestedMembershipId || membership.id === requestedMembershipId),
  );
  if ((requestedDepartmentId || requestedMembershipId) && filtered.length === 0) {
    return NextResponse.json({ error: "SCOPE_FORBIDDEN" }, { status: 403 });
  }
  const membershipIds = filtered.map((membership) => membership.id);

  const orders = membershipIds.length ? await prisma.order.findMany({
    where: {
      businessUnitId: auth.membership.businessUnitId,
      ownedByMembershipId: { in: membershipIds },
      orderedAt: { gte: start, lt: endExclusive },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: {
      ownedByMembershipId: true,
      orderedAt: true,
      status: true,
      currency: true,
      codAmountCents: true,
      recipientCountryCode: true,
    },
    orderBy: [{ orderedAt: "asc" }, { id: "asc" }],
    take: 50_001,
  }) : [];
  const truncated = orders.length > 50_000;
  if (truncated) orders.pop();

  const membershipMap = new Map(visible.map((membership) => [membership.id, membership]));
  const currencyTotals = new Map<string, number>();
  const countries = new Map<string, number>();
  const statuses = new Map<string, number>();
  const daily = new Map<string, { count: number; amountCents: number }>();
  const employee = new Map<string, { count: number; currencyTotals: Map<string, number> }>();

  for (const order of orders) {
    currencyTotals.set(order.currency, (currencyTotals.get(order.currency) ?? 0) + order.codAmountCents);
    const country = order.recipientCountryCode || "UNKNOWN";
    countries.set(country, (countries.get(country) ?? 0) + 1);
    statuses.set(order.status, (statuses.get(order.status) ?? 0) + 1);
    const day = order.orderedAt.toISOString().slice(0, 10);
    const dayRow = daily.get(day) ?? { count: 0, amountCents: 0 };
    dayRow.count += 1;
    dayRow.amountCents += order.codAmountCents;
    daily.set(day, dayRow);
    const employeeRow = employee.get(order.ownedByMembershipId) ?? { count: 0, currencyTotals: new Map<string, number>() };
    employeeRow.count += 1;
    employeeRow.currencyTotals.set(order.currency, (employeeRow.currencyTotals.get(order.currency) ?? 0) + order.codAmountCents);
    employee.set(order.ownedByMembershipId, employeeRow);
  }

  const rankings = [...employee.entries()]
    .map(([membershipId, value]) => ({
      membershipId,
      employeeName: membershipMap.get(membershipId)?.user.fullName ?? "未知员工",
      username: membershipMap.get(membershipId)?.user.username ?? "",
      departmentName: membershipMap.get(membershipId)?.department?.name ?? "未分配部门",
      count: value.count,
      currencyTotals: [...value.currencyTotals.entries()].map(([currency, amountCents]) => ({ currency, amountCents })),
    }))
    .sort((a, b) => b.count - a.count || a.employeeName.localeCompare(b.employeeName));
  const total = rankings.length;

  return NextResponse.json({
    range: { start: start.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) },
    scope: {
      canViewTeam: visible.length > 1,
      departments: [...new Map(visible.filter((row) => row.department).map((row) => [row.department!.id, row.department!])).values()],
      memberships: visible.map((row) => ({
        id: row.id,
        employeeName: row.user.fullName,
        username: row.user.username,
        departmentId: row.departmentId,
      })),
    },
    summary: {
      orderCount: orders.length,
      employeeCount: new Set(orders.map((order) => order.ownedByMembershipId)).size,
      countryCount: new Set(orders.map((order) => order.recipientCountryCode).filter(Boolean)).size,
      averageOrdersPerDay: Math.round(orders.length / (Math.floor((endDate.getTime() - start.getTime()) / DAY) + 1) * 10) / 10,
      currencyTotals: [...currencyTotals.entries()].map(([currency, amountCents]) => ({ currency, amountCents })),
    },
    daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })),
    countries: [...countries.entries()].map(([countryCode, count]) => ({ countryCode, count })).sort((a, b) => b.count - a.count),
    statuses: [...statuses.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    rankings: rankings.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    truncated,
  });
}
