import { DEFAULT_ALERT_RULES, type LogisticsAlertRule } from "@/lib/logistics";

export const logisticsQueueKeys = [
  "all",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "returning",
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
    { key: "all", label: "全部追踪", isVisible: true, sortOrder: 10 },
    { key: "in_transit", label: "运输中", isVisible: true, sortOrder: 20 },
    { key: "out_for_delivery", label: "派送中", isVisible: true, sortOrder: 30 },
    { key: "delivered", label: "已送达", isVisible: true, sortOrder: 40 },
    { key: "unhandled", label: "未处理", isVisible: true, sortOrder: 50 },
    { key: "exception", label: "物流异常", isVisible: true, sortOrder: 60 },
    { key: "returning", label: "退回中/已退回", isVisible: true, sortOrder: 70 },
    { key: "critical", label: "超期高风险", isVisible: true, sortOrder: 80 },
    { key: "high", label: "需立即跟进", isVisible: true, sortOrder: 90 },
    { key: "normal", label: "正常运输", isVisible: false, sortOrder: 100 },
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
      label: typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 30) : fallback.label,
      isVisible: value.isVisible !== false,
      sortOrder: Number.isSafeInteger(value.sortOrder) ? Number(value.sortOrder) : fallback.sortOrder,
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
