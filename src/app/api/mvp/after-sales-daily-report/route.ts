import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { isWithinReportRange, shanghaiReportRanges } from "@/lib/after-sales-report";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const read = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "shipment.read", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!read.allowed) return fail("FORBIDDEN", "没有查看售后日报的权限。", 403);
  const range = shanghaiReportRanges();
  const candidates = await prisma.membership.findMany({
    where: { businessUnitId: auth.membership.businessUnitId, isActive: true, OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }] },
    select: { id: true, userId: true, departmentId: true, siteId: true, user: { select: { fullName: true, username: true } }, department: { select: { name: true } } },
    orderBy: [{ department: { sortOrder: "asc" } }, { user: { fullName: "asc" } }],
  });
  const visibleFlags = await Promise.all(candidates.map(async (candidate) => candidate.id === auth.membership.id || (await checkPermission({
    userId: auth.userId, membershipId: auth.membership.id, actionKey: "report.team.view", targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: candidate.departmentId, targetSiteId: candidate.siteId, targetUserId: candidate.userId,
  })).allowed));
  const visible = candidates.filter((_, index) => visibleFlags[index]);
  const ids = visible.map((item) => item.id);
  const [orders, shipments, businessUnit] = await Promise.all([
    prisma.order.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, ownedByMembershipId: { in: ids }, orderedAt: { gte: range.previousMonthStart }, status: { notIn: ["DRAFT", "CANCELLED"] }, paymentMethod: { equals: "COD", mode: "insensitive" } },
      select: { ownedByMembershipId: true, orderedAt: true },
    }),
    prisma.shipment.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, order: { ownedByMembershipId: { in: ids } } },
      select: { status: true, shippedAt: true, deliveredAt: true, lastTrackedAt: true, order: { select: { ownedByMembershipId: true } } },
    }),
    prisma.businessUnit.findUnique({ where: { id: auth.membership.businessUnitId }, select: { name: true } }),
  ]);
  const rows = visible.map((member) => {
    const memberOrders = orders.filter((order) => order.ownedByMembershipId === member.id);
    const memberShipments = shipments.filter((shipment) => shipment.order.ownedByMembershipId === member.id);
    return {
      membershipId: member.id,
      employeeName: member.user.fullName,
      username: member.user.username,
      departmentName: member.department?.name ?? "未分配部门",
      todayOrders: memberOrders.filter((order) => isWithinReportRange(order.orderedAt, range.today, range.tomorrow)).length,
      monthOrders: memberOrders.filter((order) => order.orderedAt >= range.monthStart).length,
      previousMonthOrders: memberOrders.filter((order) => order.orderedAt >= range.previousMonthStart && order.orderedAt < range.monthStart).length,
      todayShipped: memberShipments.filter((shipment) => isWithinReportRange(shipment.shippedAt, range.today, range.tomorrow)).length,
      monthShipped: memberShipments.filter((shipment) => shipment.shippedAt && shipment.shippedAt >= range.monthStart).length,
      previousMonthShipped: memberShipments.filter((shipment) => isWithinReportRange(shipment.shippedAt, range.previousMonthStart, range.monthStart)).length,
      todayDelivered: memberShipments.filter((shipment) => isWithinReportRange(shipment.deliveredAt, range.today, range.tomorrow)).length,
      monthDelivered: memberShipments.filter((shipment) => shipment.deliveredAt && shipment.deliveredAt >= range.monthStart).length,
      previousMonthDelivered: memberShipments.filter((shipment) => isWithinReportRange(shipment.deliveredAt, range.previousMonthStart, range.monthStart)).length,
    };
  }).filter((row) => row.todayOrders > 0 || row.monthOrders > 0 || row.previousMonthOrders > 0 || row.todayShipped > 0 || row.monthShipped > 0 || row.previousMonthShipped > 0 || row.todayDelivered > 0 || row.monthDelivered > 0 || row.previousMonthDelivered > 0);
  const total = (key: keyof (typeof rows)[number]) => rows.reduce((sum, row) => sum + (typeof row[key] === "number" ? row[key] as number : 0), 0);
  const currentInTransit = shipments.filter((shipment) => ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(shipment.status)).length;
  const previousMonthInTransit = shipments.filter((shipment) => shipment.shippedAt && shipment.shippedAt < range.monthStart && (!shipment.deliveredAt || shipment.deliveredAt >= range.monthStart)).length;
  return ok({
    date: range.date,
    businessUnitName: businessUnit?.name ?? "当前业务板块",
    summary: {
      todayTracking: shipments.filter((shipment) => isWithinReportRange(shipment.lastTrackedAt, range.today, range.tomorrow)).length,
      todayOrders: total("todayOrders"), monthOrders: total("monthOrders"), previousMonthOrders: total("previousMonthOrders"),
      todayShipped: total("todayShipped"), monthShipped: total("monthShipped"), previousMonthShipped: total("previousMonthShipped"),
      currentInTransit, previousMonthInTransit,
      todayDelivered: total("todayDelivered"), monthDelivered: total("monthDelivered"), previousMonthDelivered: total("previousMonthDelivered"),
    },
    rows,
  });
}
