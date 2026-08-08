import { DEFAULT_ALERT_RULES, type LogisticsAlertRule } from "@/lib/logistics";
import { logisticsColorQuickTagLabels } from "@/lib/logistics-color-tags";

export const logisticsQueueKeys = [
  "all",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "signed_refund",
  "closed",
  "pending_delivery_confirmation",
  "due_today",
  "problem",
  "followed",
  "exception",
  "returning",
  "address_error",
  "delivery_failed",
  "ready_for_pickup",
  "refused",
  "read_no_reply",
  "unread_no_reply",
  "tracking_offline",
  "other_exception",
  "critical",
  "high",
  "normal",
  "unhandled",
] as const;
export type LogisticsQueueKey = (typeof logisticsQueueKeys)[number];

export type LogisticsWorkbenchCard = {
  key: LogisticsQueueKey;
  label: string;
  isVisible: boolean;
  sortOrder: number;
  matches: string[];
};

export type LogisticsWorkbenchConfig = {
  quickTags: string[];
  cards: LogisticsWorkbenchCard[];
  alertRules: LogisticsAlertRule[];
  syncIntervalMinutes: number;
  feishuNotificationsEnabled: boolean;
  feishuHighPriorityOnly: boolean;
};

export const logisticsPriorityQuickTags: ReadonlyArray<{ key: LogisticsQueueKey; label: string; tone: string }> = [
  { key: "critical", label: "跟进已超期", tone: "border-rose-200 bg-rose-50 text-rose-800" },
  { key: "problem", label: "物流异常", tone: "border-rose-200 bg-rose-50 text-rose-800" },
  { key: "pending_delivery_confirmation", label: "待人工确认签收", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "due_today", label: "今日需要跟进", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "out_for_delivery", label: "派送中", tone: "border-pink-300 bg-pink-100 text-pink-800" },
  { key: "normal", label: "普通运输", tone: "border-slate-300 bg-transparent text-slate-700" },
];

export const logisticsPriorityQuickTagLabels = logisticsPriorityQuickTags.map((tag) => tag.label);
export const logisticsFixedQuickTagLabels = [...new Set([...logisticsColorQuickTagLabels, ...logisticsPriorityQuickTagLabels])];
export const logisticsQuickTagFilterLimit = 10;

export type LogisticsQuickTagGroup = {
  key: "logistics_status" | "follow_up" | "customer_communication";
  label: "物流状态" | "跟进提醒" | "客户沟通";
  tags: string[];
};

export function logisticsQuickTagGroups(tags: Iterable<string>): LogisticsQuickTagGroup[] {
  const statusTags = new Set<string>(logisticsColorQuickTagLabels);
  const followUpTags = new Set<string>(logisticsPriorityQuickTagLabels.filter((tag) => !statusTags.has(tag)));
  const groups: LogisticsQuickTagGroup[] = [
    { key: "logistics_status", label: "物流状态", tags: [] },
    { key: "follow_up", label: "跟进提醒", tags: [] },
    { key: "customer_communication", label: "客户沟通", tags: [] },
  ];
  const seen = new Set<string>();
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    if (statusTags.has(tag)) groups[0].tags.push(tag);
    else if (followUpTags.has(tag)) groups[1].tags.push(tag);
    else groups[2].tags.push(tag);
  }
  return groups.filter((group) => group.tags.length > 0);
}

export function parseLogisticsQuickTagFilters(value: string | null | undefined, allowedTags: Iterable<string>) {
  const allowed = new Set(allowedTags);
  return [...new Set((value ?? "").split(",").map((tag) => tag.trim()).filter((tag) => allowed.has(tag)))].slice(0, logisticsQuickTagFilterLimit);
}

export function matchesLogisticsQuickTagFilters(signals: Iterable<string>, selectedTags: Iterable<string>) {
  const selected = [...selectedTags];
  if (!selected.length) return true;
  const normalizedSignals = new Set([...signals].map((signal) => signal.trim().toUpperCase()));
  return selected.some((tag) => normalizedSignals.has(`TAG:${tag.trim().toUpperCase()}`));
}

export function logisticsQueueCardsForDisplay(config: LogisticsWorkbenchConfig) {
  const priorityByKey = new Map(logisticsPriorityQuickTags.map((item) => [item.key, item]));
  return config.cards
    .filter((card) => card.key !== "exception" && (card.isVisible || priorityByKey.has(card.key)))
    .map((card) => ({ ...card, label: priorityByKey.get(card.key)?.label ?? card.label }));
}

export type LogisticsQueueCardGroupKey = "progress" | "follow_up" | "exceptions";

export const logisticsQueueCardGroupMetadata: ReadonlyArray<{
  key: LogisticsQueueCardGroupKey;
  label: "物流进度" | "跟进任务" | "异常与售后";
}> = [
  { key: "progress", label: "物流进度" },
  { key: "follow_up", label: "跟进任务" },
  { key: "exceptions", label: "异常与售后" },
];

const logisticsQueueCardGroupByKey: Record<LogisticsQueueKey, LogisticsQueueCardGroupKey> = {
  all: "progress",
  in_transit: "progress",
  out_for_delivery: "progress",
  ready_for_pickup: "progress",
  delivered: "progress",
  closed: "progress",
  pending_delivery_confirmation: "follow_up",
  due_today: "follow_up",
  followed: "follow_up",
  critical: "follow_up",
  high: "follow_up",
  unhandled: "follow_up",
  normal: "follow_up",
  signed_refund: "exceptions",
  problem: "exceptions",
  exception: "exceptions",
  returning: "exceptions",
  address_error: "exceptions",
  delivery_failed: "exceptions",
  refused: "exceptions",
  read_no_reply: "exceptions",
  unread_no_reply: "exceptions",
  tracking_offline: "exceptions",
  other_exception: "exceptions",
};

export type LogisticsQueueCardGroup = {
  key: LogisticsQueueCardGroupKey;
  label: (typeof logisticsQueueCardGroupMetadata)[number]["label"];
  cards: LogisticsWorkbenchCard[];
};

export function logisticsQueueCardGroups(config: LogisticsWorkbenchConfig): LogisticsQueueCardGroup[] {
  const groups = logisticsQueueCardGroupMetadata.map<LogisticsQueueCardGroup>((group) => ({ ...group, cards: [] }));
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const seen = new Set<LogisticsQueueKey>();
  for (const card of logisticsQueueCardsForDisplay(config)) {
    if (seen.has(card.key)) continue;
    seen.add(card.key);
    groupByKey.get(logisticsQueueCardGroupByKey[card.key])?.cards.push(card);
  }
  return groups.filter((group) => group.cards.length > 0);
}

export const defaultLogisticsWorkbenchConfig: LogisticsWorkbenchConfig = {
  quickTags: [...logisticsFixedQuickTagLabels, "已通知客户", "无人接听", "等待客户回复", "地址已确认", "需再次跟进"],
  cards: [
    { key: "all", label: "全部追踪", isVisible: true, sortOrder: 10, matches: [] },
    { key: "in_transit", label: "运输中", isVisible: true, sortOrder: 20, matches: [] },
    { key: "out_for_delivery", label: "派送中", isVisible: true, sortOrder: 30, matches: [] },
    { key: "delivered", label: "成功签收", isVisible: true, sortOrder: 40, matches: [] },
    { key: "signed_refund", label: "签收退款", isVisible: true, sortOrder: 45, matches: [] },
    { key: "closed", label: "已结束", isVisible: true, sortOrder: 46, matches: [] },
    { key: "pending_delivery_confirmation", label: "待人工确认签收", isVisible: false, sortOrder: 46, matches: [] },
    { key: "due_today", label: "今日需要跟进", isVisible: false, sortOrder: 47, matches: [] },
    { key: "problem", label: "物流异常", isVisible: false, sortOrder: 48, matches: [] },
    { key: "followed", label: "已跟进", isVisible: false, sortOrder: 49, matches: [] },
    { key: "unhandled", label: "未处理", isVisible: true, sortOrder: 50, matches: [] },
    { key: "exception", label: "物流异常", isVisible: true, sortOrder: 60, matches: [] },
    { key: "returning", label: "退回中/已退回", isVisible: true, sortOrder: 70, matches: [] },
    { key: "address_error", label: "地址错误", isVisible: true, sortOrder: 80, matches: ["EVENT:ADDRESS_ERROR", "TAG:地址错误"] },
    { key: "delivery_failed", label: "派送失败", isVisible: true, sortOrder: 90, matches: ["EVENT:DELIVERY_FAILED", "EVENT:CUSTOMER_ABSENT", "TAG:派送失败"] },
    { key: "ready_for_pickup", label: "到达代取", isVisible: true, sortOrder: 100, matches: ["EVENT:AVAILABLE_FOR_PICKUP", "EVENT:READY_FOR_PICKUP", "EVENT:COD_READY", "TAG:到达代取", "TAG:到达待取"] },
    { key: "refused", label: "拒收/退件", isVisible: true, sortOrder: 110, matches: ["EVENT:REFUSED", "EVENT:RETURNING", "EVENT:RETURNED", "TAG:拒收"] },
    { key: "read_no_reply", label: "已读不回", isVisible: true, sortOrder: 120, matches: ["TAG:已读不回"] },
    { key: "unread_no_reply", label: "不读不回", isVisible: true, sortOrder: 130, matches: ["TAG:不读不回"] },
    { key: "tracking_offline", label: "物流未上线", isVisible: true, sortOrder: 140, matches: ["NO_EVENTS"] },
    { key: "other_exception", label: "其他异常", isVisible: true, sortOrder: 150, matches: ["EVENT:OTHER", "TAG:其他"] },
    { key: "critical", label: "跟进已超期", isVisible: true, sortOrder: 160, matches: [] },
    { key: "high", label: "需立即跟进", isVisible: true, sortOrder: 170, matches: [] },
    { key: "normal", label: "普通运输", isVisible: false, sortOrder: 180, matches: [] },
  ],
  alertRules: DEFAULT_ALERT_RULES,
  syncIntervalMinutes: 30,
  feishuNotificationsEnabled: false,
  feishuHighPriorityOnly: true,
};

export function parseLogisticsWorkbenchConfig(raw: { quickTags?: unknown; cards?: unknown; alertRules?: unknown; syncIntervalMinutes?: unknown; feishuNotificationsEnabled?: unknown; feishuHighPriorityOnly?: unknown } | null | undefined): LogisticsWorkbenchConfig {
  const configuredQuickTags = Array.isArray(raw?.quickTags)
    ? raw.quickTags.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 30)).filter(Boolean)
    : defaultLogisticsWorkbenchConfig.quickTags;
  const quickTags = [...new Set([...logisticsFixedQuickTagLabels, ...configuredQuickTags])].slice(0, 40);
  const sourceCards = Array.isArray(raw?.cards) ? raw.cards : defaultLogisticsWorkbenchConfig.cards;
  const byKey = new Map<LogisticsQueueKey, LogisticsWorkbenchCard>();
  for (const item of sourceCards) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if (!logisticsQueueKeys.includes(value.key as LogisticsQueueKey)) continue;
    const key = value.key as LogisticsQueueKey;
    if (byKey.has(key)) continue;
    const fallback = defaultLogisticsWorkbenchConfig.cards.find((card) => card.key === key)!;
    byKey.set(key, {
      key,
      label: key === "delivered" ? "成功签收" : key === "signed_refund" ? "签收退款" : key === "closed" ? "已结束" : key === "critical" ? "跟进已超期" : key === "ready_for_pickup" ? "到达代取" : typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 30) : fallback.label,
      isVisible: value.isVisible !== false,
      sortOrder: Number.isSafeInteger(value.sortOrder) ? Number(value.sortOrder) : fallback.sortOrder,
      matches: Array.isArray(value.matches)
        ? [...new Set(value.matches.filter((match): match is string => typeof match === "string").map((match) => match.trim().toUpperCase()).filter(Boolean))].slice(0, 30)
        : fallback.matches,
    });
  }
  for (const fallback of defaultLogisticsWorkbenchConfig.cards) if (!byKey.has(fallback.key)) byKey.set(fallback.key, fallback);
  const alertRules = Array.isArray(raw?.alertRules)
    ? raw.alertRules.flatMap((item): LogisticsAlertRule[] => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        const key = typeof value.key === "string" ? value.key.trim().toUpperCase().slice(0, 30) : "";
        const matches = Array.isArray(value.matches) ? value.matches.filter((match): match is string => typeof match === "string").map((match) => match.trim()).filter(Boolean).slice(0, 10) : [];
        const milestoneEvent = typeof value.milestoneEvent === "string" ? value.milestoneEvent.trim().toUpperCase() : "";
        const days = Number(value.silentWorkDaysBeforeMilestone);
        if (!key || !matches.length || !["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", "RETURNING", "RETURNED", "ADDRESS_ERROR", "CUSTOMER_ABSENT", "REFUSED"].includes(milestoneEvent) || !Number.isInteger(days) || days < 0 || days > 30) return [];
        return [{ key, matches, milestoneEvent: milestoneEvent as LogisticsAlertRule["milestoneEvent"], silentWorkDaysBeforeMilestone: days }];
      }).slice(0, 100)
    : defaultLogisticsWorkbenchConfig.alertRules;
  const interval = Number(raw?.syncIntervalMinutes);
  const syncIntervalMinutes = Number.isInteger(interval) && interval >= 5 && interval <= 1440 ? interval : 30;
  return {
    quickTags,
    cards: [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    alertRules,
    syncIntervalMinutes,
    feishuNotificationsEnabled: raw?.feishuNotificationsEnabled === true,
    feishuHighPriorityOnly: raw?.feishuHighPriorityOnly !== false,
  };
}
