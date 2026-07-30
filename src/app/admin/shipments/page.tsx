import { redirect } from "next/navigation";

import LogisticsTrackingWorkbench from "@/components/admin/LogisticsTrackingWorkbench";
import LogisticsWorkbenchSettings from "@/components/admin/LogisticsWorkbenchSettings";
import type { Prisma } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { HIGH_PRIORITY_SHIPMENT_EVENTS, shipmentEventMeta } from "@/lib/logistics";
import { prisma } from "@/lib/prisma";
import { formatMoneyCents } from "@/lib/money";
import { parseLogisticsWorkbenchConfig } from "@/lib/logistics-workbench-config";

type ShipmentQueue = "high_priority" | "needs_attention" | "in_transit" | "all";
type Urgency = "critical" | "high" | "normal";

const NOW_TS = Date.now();

function classifyOverdue(latestFollowAt: Date | null) {
  if (!latestFollowAt) {
    return {
      overdue: false,
      dueLabel: "-",
      overdueMinutes: null as number | null,
      overdueHoursLabel: "-",
    };
  }

  const diffMinutes = Math.floor((latestFollowAt.getTime() - NOW_TS) / (60 * 1000));

  if (diffMinutes < 0) {
    const hours = Math.abs(Math.floor(diffMinutes / 60));
    const minutes = Math.abs(diffMinutes % 60);
    return {
      overdue: true,
      dueLabel: `超期提醒：${new Date(latestFollowAt).toLocaleString("zh-CN")}`,
      overdueMinutes: Math.abs(latestFollowAt.getTime() - NOW_TS) / (60 * 1000),
      overdueHoursLabel: `${hours}小时${minutes}分钟` + (hours > 0 || minutes > 0 ? "" : ""),
    };
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return {
    overdue: false,
    dueLabel: `预计联系：${new Date(latestFollowAt).toLocaleString("zh-CN")}`,
    overdueMinutes: -1,
    overdueHoursLabel: `${hours}小时${minutes}分钟后`,
  };
}

function classifyUrgency(overdue: boolean, highPriority: boolean, followAt: Date | null): Urgency {
  if (overdue) return "critical";
  if (highPriority) return "high";
  if (followAt && followAt.getTime() <= NOW_TS + 60 * 60 * 1000) return "high";
  return "normal";
}

function urgencyBadge(urgency: Urgency) {
  if (urgency === "critical") return "超期高风险";
  if (urgency === "high") return "需跟进";
  return "正常";
}

function urgencyScore(urgency: Urgency) {
  if (urgency === "critical") return 3;
  if (urgency === "high") return 2;
  return 1;
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; overdue?: string; showOnly?: string }>;
}) {
  const params = await searchParams;
  const queue = (params.queue as ShipmentQueue | undefined) ?? "all";
  const overdueOnly = params.overdue === "1";

  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const canRead = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.read",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!canRead.allowed) redirect("/admin");
  const [canViewTrackingNo, canViewTimeline, canAnnotate] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.tracking_no.view",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.timeline.view",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.track.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  const canConfigure = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.workbench.configure",
    targetBusinessUnitId: membership.businessUnitId,
  });
  const workbenchSetting = await prisma.logisticsWorkbenchSetting.findUnique({
    where: { businessUnitId: membership.businessUnitId },
  });
  const workbenchConfig = parseLogisticsWorkbenchConfig(workbenchSetting);

  const queueWhere: Prisma.ShipmentWhereInput | undefined =
    queue === "needs_attention"
      ? { workStatus: "NEEDS_ATTENTION" as const }
      : queue === "high_priority"
        ? {
            events: {
              some: { eventType: { in: [...HIGH_PRIORITY_SHIPMENT_EVENTS] } },
            },
          }
        : queue === "in_transit"
          ? { status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } }
          : undefined;

  const rows = await prisma.shipment.findMany({
    where: { businessUnitId: membership.businessUnitId, status: { not: "PENDING" }, ...queueWhere },
    include: {
      order: {
        select: {
          id: true,
          departmentId: true,
          creatorUserId: true,
          orderNo: true,
          recipientName: true,
          recipientPhone: true,
          recipientEmail: true,
          customerWhatsapp: true,
          recipientCountryCode: true,
          codAmountCents: true,
          currency: true,
          customer: { select: { name: true } },
          creatorUser: { select: { username: true, fullName: true } },
          ownerMembership: {
            select: {
              id: true,
              department: { select: { id: true, name: true } },
              managerMembership: {
                select: { id: true, user: { select: { username: true, fullName: true } } },
              },
            },
          },
          items: { select: { productName: true, quantity: true }, orderBy: { id: "asc" } },
        },
      },
      events: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 10,
        include: {
          annotation: {
            include: { handledByMembership: { include: { user: { select: { username: true, fullName: true } } } } },
          },
        },
      },
      followUps: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { nextFollowUpAt: true },
      },
      _count: { select: { events: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const unhandledEventGroups = rows.length
    ? await prisma.shipmentEvent.groupBy({
        by: ["shipmentId"],
        where: {
          shipmentId: { in: rows.map((row) => row.id) },
          OR: [
            { annotation: { is: null } },
            { annotation: { is: { isHandled: false } } },
          ],
        },
        _count: { _all: true },
      })
    : [];
  const unhandledEventCounts = new Map(unhandledEventGroups.map((item) => [item.shipmentId, item._count._all]));

  const scopedRows = (await Promise.all(rows.map(async (row) => {
    const target = {
      userId: session.userId,
      membershipId: membership.id,
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: row.order.departmentId,
      targetSiteId: row.siteId,
      targetUserId: row.order.creatorUserId,
    };
    const [read, trackingNo, timeline, annotate] = await Promise.all([
      checkPermission({ ...target, actionKey: "shipment.read" }),
      checkPermission({ ...target, actionKey: "shipment.tracking_no.view" }),
      checkPermission({ ...target, actionKey: "shipment.timeline.view" }),
      checkPermission({ ...target, actionKey: "shipment.track.update" }),
    ]);
    return { row, read: read.allowed, trackingNo: trackingNo.allowed, timeline: timeline.allowed, annotate: annotate.allowed };
  }))).filter((item) => item.read);

  const withDerived = scopedRows
    .map(({ row, trackingNo, timeline, annotate }) => {
      const latest = row.events[0];
      const latestFollowAt = row.followUps[0]?.nextFollowUpAt ?? row.nextFollowUpAt ?? null;
      const { overdue, dueLabel, overdueHoursLabel, overdueMinutes } = classifyOverdue(latestFollowAt);
      const isHighPriority =
        latest && HIGH_PRIORITY_SHIPMENT_EVENTS.includes(latest.eventType as keyof typeof shipmentEventMeta);
      const urgency = classifyUrgency(overdue, Boolean(isHighPriority), latestFollowAt);

      return {
        ...row,
        latestEvent: latest?.eventType ?? "N/A",
        latestMemo: latest?.memo ?? "-",
        latestTime: latest?.occurredAt ? new Date(latest.occurredAt).toLocaleString("zh-CN") : "-",
        dueStatus: dueLabel,
        overdueHoursLabel,
        overdueMinutes: overdueMinutes,
        isOverdue: overdue ? "YES" : "NO",
        isOverdueLabel: overdue ? "YES" : "NO",
        urgency,
        urgencyLabel: urgencyBadge(urgency),
        priorityTag: isHighPriority ? "高优先级" : "-",
        urgencyScore: urgencyScore(urgency),
        followUpAt: latestFollowAt ? new Date(latestFollowAt).toLocaleString("zh-CN") : "-",
        canViewTrackingNo: trackingNo,
        canViewTimeline: timeline,
        canAnnotate: timeline && annotate,
      };
    })
    .filter((item) => (overdueOnly ? item.isOverdue === "YES" : true))
    .sort((a, b) => {
      const urgencyDelta = (b.urgencyScore ?? 1) - (a.urgencyScore ?? 1);
      if (urgencyDelta !== 0) return urgencyDelta;
      return new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime();
    });

  return (
    <div className="space-y-4">
    {canConfigure.allowed && <LogisticsWorkbenchSettings initial={workbenchConfig} />}
    <LogisticsTrackingWorkbench
      config={workbenchConfig}
      canViewTrackingNo={canViewTrackingNo.allowed}
      canViewTimeline={canViewTimeline.allowed}
      canAnnotate={canViewTimeline.allowed && canAnnotate.allowed}
      rows={withDerived.map((row) => ({
        id: row.id,
        trackingNo: row.canViewTrackingNo ? row.trackingNo : null,
        canViewTrackingNo: row.canViewTrackingNo,
        canViewTimeline: row.canViewTimeline,
        canAnnotate: row.canAnnotate,
        carrier: row.carrier,
        status: row.status,
        urgency: row.urgency,
        urgencyLabel: row.urgencyLabel,
        priorityTag: row.priorityTag,
        dueStatus: row.dueStatus,
        order: {
          ...row.order,
          codAmountLabel: formatMoneyCents(row.order.codAmountCents, row.order.currency),
        },
        events: row.canViewTimeline ? row.events.map((event) => ({
          id: event.id,
          occurredAt: event.occurredAt.toISOString(),
          eventType: event.eventType,
          statusMilestone: event.statusMilestone,
          location: event.location,
          memo: event.memo,
          annotation: event.annotation ? {
            note: event.annotation.note,
            tags: event.annotation.tags,
            isHandled: event.annotation.isHandled,
            handledAt: event.annotation.handledAt?.toISOString() ?? null,
            handledByMembership: event.annotation.handledByMembership,
          } : null,
        })) : [],
        eventTotal: row.canViewTimeline ? row._count.events : 0,
        unhandledEventCount: row.canViewTimeline ? (unhandledEventCounts.get(row.id) ?? 0) : 0,
      }))}
    />
    </div>
  );
}
