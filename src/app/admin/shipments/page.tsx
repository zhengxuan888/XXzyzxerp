import { redirect } from "next/navigation";

import LogisticsTrackingWorkbench from "@/components/admin/LogisticsTrackingWorkbench";
import LogisticsWorkbenchSettings from "@/components/admin/LogisticsWorkbenchSettings";
import AfterSalesDailyReport from "@/components/admin/AfterSalesDailyReport";
import { ShipmentStatus, type Prisma } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { createShipmentAccessPlan } from "@/lib/shipment-access";
import { HIGH_PRIORITY_SHIPMENT_EVENTS, shipmentEventMeta } from "@/lib/logistics";
import { prisma } from "@/lib/prisma";
import { formatMoneyCents } from "@/lib/money";
import { getServerNowMs } from "@/lib/server-clock";
import { logisticsQueueKeys, parseLogisticsWorkbenchConfig, type LogisticsQueueKey } from "@/lib/logistics-workbench-config";
import { loadTrackingTranslations, trackingTextHash } from "@/lib/tracking-translation-service";

type Urgency = "critical" | "high" | "normal";

function classifyOverdue(latestFollowAt: Date | null, nowTs: number) {
  if (!latestFollowAt) {
    return {
      overdue: false,
      dueLabel: "-",
      overdueMinutes: null as number | null,
      overdueHoursLabel: "-",
    };
  }

  const diffMinutes = Math.floor((latestFollowAt.getTime() - nowTs) / (60 * 1000));

  if (diffMinutes < 0) {
    const hours = Math.abs(Math.floor(diffMinutes / 60));
    const minutes = Math.abs(diffMinutes % 60);
    return {
      overdue: true,
      dueLabel: `超期提醒：${new Date(latestFollowAt).toLocaleString("zh-CN")}`,
      overdueMinutes: Math.abs(latestFollowAt.getTime() - nowTs) / (60 * 1000),
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

function classifyUrgency(overdue: boolean, highPriority: boolean, followAt: Date | null, nowTs: number): Urgency {
  if (overdue) return "critical";
  if (highPriority) return "high";
  if (followAt && followAt.getTime() <= nowTs + 60 * 60 * 1000) return "high";
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

function matchesQueueSignals(
  row: { status: string; urgency: Urgency; eventTotal: number; unhandledEventCount: number; queueSignals: Set<string> },
  queue: LogisticsQueueKey,
  configuredMatches: string[],
) {
  if (queue === "all") return true;
  if (queue === "critical" || queue === "high" || queue === "normal") return row.urgency === queue;
  if (queue === "unhandled") return row.unhandledEventCount > 0;
  if (queue === "in_transit") return ["PICKED_UP", "IN_TRANSIT"].includes(row.status);
  if (queue === "out_for_delivery") return row.status === "OUT_FOR_DELIVERY";
  if (queue === "delivered") return ["DELIVERED", "CLOSED"].includes(row.status);
  if (queue === "exception") return row.status === "EXCEPTION";
  if (queue === "returning") return ["RETURNING", "RETURNED"].includes(row.status);
  if (!configuredMatches.length) return false;
  const signals = new Set(row.queueSignals);
  signals.add(`STATUS:${row.status.toUpperCase()}`);
  if (row.eventTotal === 0) signals.add("NO_EVENTS");
  return configuredMatches.some((match) => signals.has(match.trim().toUpperCase()));
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    queue?: string;
    overdue?: string;
    q?: string;
    departmentId?: string;
    managerMembershipId?: string;
    creatorMembershipId?: string;
    status?: string;
    carrier?: string;
    destination?: string;
    owner?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await searchParams;
  const nowTs = getServerNowMs();
  const queue = logisticsQueueKeys.includes(params.queue as LogisticsQueueKey)
    ? params.queue as LogisticsQueueKey
    : "unhandled";
  const overdueOnly = params.overdue === "1";
  const pageSize = [10, 20, 50].includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const requestedStatus = Object.values(ShipmentStatus).includes(params.status as ShipmentStatus) && params.status !== "PENDING"
    ? params.status as ShipmentStatus
    : null;
  const requestedOwnerFilter = params.owner === "mine" || params.owner === "unassigned" || params.owner === "all" ? params.owner : null;

  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  // Compile permission scopes once for this request.  The resulting predicate
  // is reused by the candidate query, and the pure `allows` check prevents a
  // per-row burst of Membership/Role/Grant reads.
  const [
    readAccess,
    trackingNumberAccess,
    timelineAccess,
    annotationAccess,
    canConfigure,
    canReassign,
    workbenchSetting,
  ] = await Promise.all([
    createShipmentAccessPlan({ membership, actionKey: "shipment.read" }),
    createShipmentAccessPlan({ membership, actionKey: "shipment.tracking_no.view" }),
    createShipmentAccessPlan({ membership, actionKey: "shipment.timeline.view" }),
    createShipmentAccessPlan({ membership, actionKey: "shipment.track.update" }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.workbench.configure",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "shipment.followup.assign",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    prisma.logisticsWorkbenchSetting.findUnique({
      where: { businessUnitId: membership.businessUnitId },
    }),
  ]);
  if (!readAccess.allowed) redirect("/admin");
  const workbenchConfig = parseLogisticsWorkbenchConfig(workbenchSetting);
  // 所有售后人员默认先看自己认领的任务；负责人可主动切换到全部或未分配。
  const ownerFilter = requestedOwnerFilter === "all" && !canReassign ? "mine" : (requestedOwnerFilter ?? "mine");

  // Apply filters that map directly to indexed columns before loading related
  // tracking data. Queue signals and field-level permission checks remain
  // after the query because their rules are configuration- and scope-driven.
  const orderWhere: Prisma.OrderWhereInput = {
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(params.creatorMembershipId ? { ownedByMembershipId: params.creatorMembershipId } : {}),
    ...(params.destination ? { recipientCountryCode: params.destination } : {}),
    ...(params.managerMembershipId ? { ownerMembership: { is: { managerMembershipId: params.managerMembershipId } } } : {}),
  };
  const shipmentWhere: Prisma.ShipmentWhereInput = {
    AND: [
      readAccess.where,
      {
        status: requestedStatus ?? { not: "PENDING" },
        ...(params.carrier ? { carrier: params.carrier } : {}),
        ...(ownerFilter === "mine" ? { ownerMembershipId: membership.id } : {}),
        ...(ownerFilter === "unassigned" ? { ownerMembershipId: null } : {}),
        ...(Object.keys(orderWhere).length ? { order: { is: orderWhere } } : {}),
      },
    ],
  };

  // Candidate rows intentionally exclude timeline history, customer payloads,
  // and annotation details. They are enough to derive queues and pagination;
  // the expensive detail graph is fetched only for the current page below.
  const candidateRows = await prisma.shipment.findMany({
    where: shipmentWhere,
    select: {
      id: true,
      businessUnitId: true,
      siteId: true,
      carrier: true,
      trackingNo: true,
      status: true,
      nextFollowUpAt: true,
      createdAt: true,
      updatedAt: true,
      order: {
        select: {
          id: true,
          departmentId: true,
          creatorUserId: true,
          ownedByMembershipId: true,
          orderNo: true,
          status: true,
          exceptionNote: true,
          shopId: true,
          recipientName: true,
          recipientEmail: true,
          customerWhatsapp: true,
          recipientCountryCode: true,
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
        take: 1,
        select: { eventType: true, memo: true, occurredAt: true, annotation: { select: { note: true, tags: true } } },
      },
      _count: { select: { events: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const unhandledEventGroups = candidateRows.length
    ? await prisma.shipmentEvent.groupBy({
        by: ["shipmentId"],
        where: {
          shipmentId: { in: candidateRows.map((row) => row.id) },
          OR: [
            { annotation: { is: null } },
            { annotation: { is: { isHandled: false } } },
          ],
        },
        _count: { _all: true },
      })
    : [];
  const unhandledEventCounts = new Map(unhandledEventGroups.map((item) => [item.shipmentId, item._count._all]));
  const signalEvents = candidateRows.length
    ? await prisma.shipmentEvent.findMany({
        where: { shipmentId: { in: candidateRows.map((row) => row.id) } },
        select: { shipmentId: true, eventType: true, annotation: { select: { tags: true } } },
      })
    : [];
  const queueSignals = new Map<string, Set<string>>();
  for (const event of signalEvents) {
    const signals = queueSignals.get(event.shipmentId) ?? new Set<string>();
    signals.add(`EVENT:${event.eventType.toUpperCase()}`);
    for (const tag of event.annotation?.tags ?? []) signals.add(`TAG:${tag.trim().toUpperCase()}`);
    queueSignals.set(event.shipmentId, signals);
  }

  const scopedRows = candidateRows.map((row) => {
    const target = {
      businessUnitId: row.businessUnitId,
      departmentId: row.order.departmentId,
      siteId: row.siteId,
      creatorUserId: row.order.creatorUserId,
      ownerMembershipId: row.order.ownedByMembershipId,
    };
    const timeline = timelineAccess.allows(target);
    return {
      row,
      trackingNo: trackingNumberAccess.allows(target),
      timeline,
      annotate: timeline && annotationAccess.allows(target),
    };
  });

  const withDerived = scopedRows
    .map(({ row, trackingNo, timeline, annotate }) => {
      const latest = row.events[0];
      const latestFollowed = Boolean(latest?.annotation?.note?.trim() || latest?.annotation?.tags?.length);
      const latestFollowAt = row.nextFollowUpAt ?? null;
      const { overdue, dueLabel, overdueHoursLabel, overdueMinutes } = classifyOverdue(latestFollowAt, nowTs);
      const isHighPriority =
        latest && HIGH_PRIORITY_SHIPMENT_EVENTS.includes(latest.eventType as keyof typeof shipmentEventMeta);
      const urgency = classifyUrgency(overdue, Boolean(isHighPriority), latestFollowAt, nowTs);

      return {
        ...row,
        latestEvent: latest?.eventType ?? "N/A",
        latestMemo: latest?.memo ?? "-",
        latestTime: latest?.occurredAt ? new Date(latest.occurredAt).toLocaleString("zh-CN") : "-",
        latestFollowed,
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
  const keyword = params.q?.trim().toLocaleLowerCase() ?? "";
  const baseFiltered = withDerived.filter((row) => {
    if (!keyword) return true;
    const searchable = [
      row.canViewTrackingNo ? row.trackingNo : null,
      row.order.orderNo,
      row.order.shopId,
      row.order.recipientName,
      row.order.recipientEmail,
      row.order.customerWhatsapp,
      row.order.creatorUser.fullName,
      row.order.creatorUser.username,
      ...row.order.items.map((item) => item.productName),
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(keyword);
  });
  const matchesCard = (row: (typeof baseFiltered)[number], key: LogisticsQueueKey) => {
    if (key === "delivered") return row.status === "DELIVERED" && row.order.exceptionNote === "人工确认成功签收";
    if (key === "signed_refund") return row.order.exceptionNote === "签收后退款";
    if (key === "unhandled") return row._count.events > 0 && !row.latestFollowed;
    if (key === "followed") return row._count.events > 0 && row.latestFollowed;
    if (key === "pending_delivery_confirmation") return row.status === "DELIVERED" && row.order.exceptionNote !== "人工确认成功签收" && row.order.exceptionNote !== "签收后退款";
    if (key === "due_today") {
      if (!row.nextFollowUpAt) return false;
      const followAt = new Date(row.nextFollowUpAt);
      const today = new Date();
      return followAt.getFullYear() === today.getFullYear() && followAt.getMonth() === today.getMonth() && followAt.getDate() === today.getDate();
    }
    if (key === "problem") {
      const signals = row.canViewTimeline ? (queueSignals.get(row.id) ?? new Set<string>()) : new Set<string>();
      return ["EXCEPTION", "RETURNING", "RETURNED"].includes(row.status)
        || ["EVENT:ADDRESS_ERROR", "EVENT:DELIVERY_FAILED", "EVENT:CUSTOMER_ABSENT", "EVENT:REFUSED", "EVENT:RETURNING", "EVENT:RETURNED"].some((signal) => signals.has(signal));
    }
    const configuredMatches = workbenchConfig.cards.find((card) => card.key === key)?.matches ?? [];
    return matchesQueueSignals({
      status: row.status,
      urgency: row.urgency,
      eventTotal: row._count.events,
      unhandledEventCount: row.canViewTimeline ? (unhandledEventCounts.get(row.id) ?? 0) : 0,
      queueSignals: row.canViewTimeline ? (queueSignals.get(row.id) ?? new Set<string>()) : new Set<string>(),
    }, key, configuredMatches);
  };
  const queueCounts = Object.fromEntries(
    workbenchConfig.cards.map((card) => [card.key, baseFiltered.filter((row) => matchesCard(row, card.key)).length]),
  ) as Partial<Record<LogisticsQueueKey, number>>;
  const filteredRows = baseFiltered.filter((row) => matchesCard(row, queue));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = pageRows.map((row) => row.id);
  const detailRows = pageIds.length
    ? await prisma.shipment.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        updatedAt: true,
        trackingNo: true,
        carrier: true,
        status: true,
        ownerMembership: {
          select: {
            id: true,
            user: { select: { username: true, fullName: true } },
          },
        },
        order: {
          select: {
            id: true,
            orderNo: true,
            status: true,
            exceptionNote: true,
            shopId: true,
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
      },
    })
    : [];
  const detailById = new Map(detailRows.map((row) => [row.id, row]));
  const trackingTranslations = await loadTrackingTranslations(membership.businessUnitId, detailRows.flatMap((row) => row.events.map((event) => event.memo)));

  const departments = [...new Map(withDerived.flatMap((row) => row.order.ownerMembership.department
    ? [[row.order.ownerMembership.department.id, row.order.ownerMembership.department] as const]
    : [])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const managers = [...new Map(withDerived.flatMap((row) => row.order.ownerMembership.managerMembership
    ? [[row.order.ownerMembership.managerMembership.id, {
        id: row.order.ownerMembership.managerMembership.id,
        name: row.order.ownerMembership.managerMembership.user.fullName || row.order.ownerMembership.managerMembership.user.username,
        departmentId: row.order.ownerMembership.department?.id ?? null,
      }] as const]
    : [])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const creators = [...new Map(withDerived.map((row) => [row.order.ownerMembership.id, {
    id: row.order.ownerMembership.id,
    name: row.order.creatorUser.fullName || row.order.creatorUser.username,
    departmentId: row.order.ownerMembership.department?.id ?? null,
    managerMembershipId: row.order.ownerMembership.managerMembership?.id ?? null,
  }] as const)).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const statuses = [...new Set(withDerived.map((row) => row.status))].sort();
  const carriers = [...new Set(withDerived.map((row) => row.carrier).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const destinations = [...new Set(withDerived.map((row) => row.order.recipientCountryCode).filter((value): value is string => Boolean(value)))].sort();
  const presentationRows = pageRows.flatMap((row) => {
    const detail = detailById.get(row.id);
    if (!detail) return [];
    return [{
      id: detail.id,
      updatedAt: detail.updatedAt.toISOString(),
      trackingNo: row.canViewTrackingNo ? detail.trackingNo : null,
      canViewTrackingNo: row.canViewTrackingNo,
      canViewTimeline: row.canViewTimeline,
      canAnnotate: row.canAnnotate,
      carrier: detail.carrier,
      status: detail.status,
      urgency: row.urgency,
      urgencyLabel: row.urgencyLabel,
      priorityTag: row.priorityTag,
      dueStatus: row.dueStatus,
      order: {
        ...detail.order,
        codAmountLabel: formatMoneyCents(detail.order.codAmountCents, detail.order.currency),
      },
      events: row.canViewTimeline ? detail.events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        eventType: event.eventType,
        statusMilestone: event.statusMilestone,
        location: event.location,
        memo: event.memo,
        memoTranslation: event.memo ? trackingTranslations.get(trackingTextHash(event.memo)) ?? null : null,
        annotation: event.annotation ? {
          note: event.annotation.note,
          tags: event.annotation.tags,
          isHandled: event.annotation.isHandled,
          handledAt: event.annotation.handledAt?.toISOString() ?? null,
          updatedAt: event.annotation.updatedAt.toISOString(),
          handledByMembership: event.annotation.handledByMembership,
        } : null,
      })) : [],
      eventTotal: row.canViewTimeline ? row._count.events : 0,
      unhandledEventCount: row.canViewTimeline ? (unhandledEventCounts.get(row.id) ?? 0) : 0,
      queueSignals: row.canViewTimeline ? [...(queueSignals.get(row.id) ?? [])] : [],
      followUpOwner: detail.ownerMembership,
    }];
  });

  return (
    <div className="space-y-4">
    {canConfigure.allowed && <>
      <LogisticsWorkbenchSettings initial={workbenchConfig} />
    </>}
    <LogisticsTrackingWorkbench
      config={workbenchConfig}
      canViewTrackingNo={trackingNumberAccess.allowed}
      canViewTimeline={timelineAccess.allowed}
      canAnnotate={timelineAccess.allowed && annotationAccess.allowed}
      currentMembershipId={membership.id}
      canReassign={canReassign.allowed}
      pagination={{ page, pageSize, total: filteredRows.length, pageCount }}
      queueCounts={queueCounts}
      filterOptions={{ departments, managers, creators, statuses, carriers, destinations }}
      rows={presentationRows}
    />
    <AfterSalesDailyReport />
    </div>
  );
}
