import { DEFAULT_ALERT_RULES, type LogisticsAlertRule } from "@/lib/logistics";

export const logisticsQueueKeys = [
  "all",
  "in_transit",
  "out_for_delivery",
  "delivered",
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

export const defaultLogisticsWorkbenchConfig: LogisticsWorkbenchConfig = {
  quickTags: ["已通知客户", "无人接听", "等待客户回复", "地址已确认", "需再次跟进"],
  cards: [
    { key: "all", label: "全部追踪", isVisible: true, sortOrder: 10, matches: [] },
    { key: "in_transit", label: "运输中", isVisible: true, sortOrder: 20, matches: [] },
    { key: "out_for_delivery", label: "派送中", isVisible: true, sortOrder: 30, matches: [] },
    { key: "delivered", label: "已送达", isVisible: true, sortOrder: 40, matches: [] },
    { key: "unhandled", label: "未处理", isVisible: true, sortOrder: 50, matches: [] },
    { key: "exception", label: "物流异常", isVisible: true, sortOrder: 60, matches: [] },
    { key: "returning", label: "退回中/已退回", isVisible: true, sortOrder: 70, matches: [] },
    { key: "address_error", label: "地址错误", isVisible: true, sortOrder: 80, matches: ["EVENT:ADDRESS_ERROR", "TAG:地址错误"] },
    { key: "delivery_failed", label: "派送失败", isVisible: true, sortOrder: 90, matches: ["EVENT:DELIVERY_FAILED", "EVENT:CUSTOMER_ABSENT", "TAG:派送失败"] },
    { key: "ready_for_pickup", label: "到达待取", isVisible: true, sortOrder: 100, matches: ["EVENT:READY_FOR_PICKUP", "EVENT:COD_READY", "TAG:到达待取"] },
    { key: "refused", label: "拒收/退件", isVisible: true, sortOrder: 110, matches: ["EVENT:REFUSED", "EVENT:RETURNING", "EVENT:RETURNED", "TAG:拒收"] },
    { key: "read_no_reply", label: "已读不回", isVisible: true, sortOrder: 120, matches: ["TAG:已读不回"] },
    { key: "unread_no_reply", label: "不读不回", isVisible: true, sortOrder: 130, matches: ["TAG:不读不回"] },
    { key: "tracking_offline", label: "物流未上线", isVisible: true, sortOrder: 140, matches: ["NO_EVENTS"] },
    { key: "other_exception", label: "其他异常", isVisible: true, sortOrder: 150, matches: ["EVENT:OTHER", "TAG:其他"] },
    { key: "critical", label: "超期高风险", isVisible: true, sortOrder: 160, matches: [] },
    { key: "high", label: "需立即跟进", isVisible: true, sortOrder: 170, matches: [] },
    { key: "normal", label: "正常运输", isVisible: false, sortOrder: 180, matches: [] },
  ],
  alertRules: DEFAULT_ALERT_RULES,
  syncIntervalMinutes: 30,
  feishuNotificationsEnabled: false,
  feishuHighPriorityOnly: true,
};

export function parseLogisticsWorkbenchConfig(raw: { quickTags?: unknown; cards?: unknown; alertRules?: unknown; syncIntervalMinutes?: unknown; feishuNotificationsEnabled?: unknown; feishuHighPriorityOnly?: unknown } | null | undefined): LogisticsWorkbenchConfig {
  const quickTags = Array.isArray(raw?.quickTags)
    ? [...new Set(raw.quickTags.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 30)).filter(Boolean))].slice(0, 20)
    : defaultLogisticsWorkbenchConfig.quickTags;
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
      label: key === "delivered" ? "成功签收" : typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 30) : fallback.label,
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
