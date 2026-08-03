import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000+08:00`);
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value("weekday")] ?? 1;
  const week = new Date(today); week.setUTCDate(week.getUTCDate() - weekday + 1);
  const month = new Date(`${value("year")}-${value("month")}-01T00:00:00.000+08:00`);
  const where = { businessUnitId: auth.membership.businessUnitId, ownedByMembershipId: auth.membership.id, status: { not: "CANCELLED" as const } };
  const [todayCount, weekCount, monthCount] = await Promise.all([
    prisma.order.count({ where: { ...where, createdAt: { gte: today } } }),
    prisma.order.count({ where: { ...where, createdAt: { gte: week } } }),
    prisma.order.count({ where: { ...where, createdAt: { gte: month } } }),
  ]);
  return NextResponse.json({ today: todayCount, week: weekCount, month: monthCount });
}
