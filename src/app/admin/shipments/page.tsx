import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import type { Prisma } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { HIGH_PRIORITY_SHIPMENT_EVENTS, shipmentEventMeta } from "@/lib/logistics";
import { prisma } from "@/lib/prisma";

type ShipmentQueue = "high_priority" | "needs_attention" | "in_transit" | "all";
type Urgency = "critical" | "high" | "normal";

const NOW_TS = Date.now();

function queueLabel(queue: ShipmentQueue) {
  if (queue === "high_priority") return "高优先级待办";
  if (queue === "needs_attention") return "需要关注";
  if (queue === "in_transit") return "运输中";
  return "物流列表";
}

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

function classifyUrgency(overdue: boolean, highPriority: boolean, followAt: Date | null) {
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
      order: { select: { orderNo: true } },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { eventType: true, memo: true, occurredAt: true },
      },
      followUps: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { nextFollowUpAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const withDerived = rows
    .map((row) => {
      const latest = row.events[0];
      const latestFollowAt = row.followUps[0]?.nextFollowUpAt ?? null;
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
      };
    })
    .filter((item) => (overdueOnly ? item.isOverdue === "YES" : true))
    .sort((a, b) => {
      const urgencyDelta = (b.urgencyScore ?? 1) - (a.urgencyScore ?? 1);
      if (urgencyDelta !== 0) return urgencyDelta;
      return new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime();
    });

  const detailPath = "/admin/shipments";

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="shipments"
      listTitle={overdueOnly ? `${queueLabel(queue)}（仅超期）` : queueLabel(queue)}
      detailPath={detailPath}
      canCreate={false}
      canDelete={false}
      showCreate={false}
      rowClassName={(row) => {
        if (row.urgency === "critical") return "bg-rose-50/40";
        if (row.urgency === "high") return "bg-amber-50/50";
        return "";
      }}
      rows={withDerived}
      createFields={[]}
      dataColumns={[
        { key: "trackingNo", label: "物流单号" },
        { key: "priorityTag", label: "优先级" },
        { key: "latestEvent", label: "最新轨迹" },
        { key: "latestMemo", label: "轨迹说明" },
        { key: "latestTime", label: "轨迹时间" },
        { key: "dueStatus", label: "联系提醒" },
        { key: "overdueHoursLabel", label: "跟进时限" },
        { key: "urgencyLabel", label: "紧急程度" },
        { key: "isOverdueLabel", label: "是否超期" },
        { key: "followUpAt", label: "下次跟进" },
        {
          key: "order",
          label: "订单号",
          render: (row) => {
            const value = row.order as { orderNo?: string } | undefined;
            return value?.orderNo ?? "-";
          },
        },
        { key: "carrier", label: "物流商" },
        { key: "status", label: "运输状态" },
        {
          key: "createdAt",
          label: "创建时间",
          render: (row) => {
            const value = row.createdAt;
            const createdAt = typeof value === "string" ? new Date(value) : value;
            return createdAt ? createdAt.toLocaleString("zh-CN") : "-";
          },
        },
      ]}
    />
  );
}
