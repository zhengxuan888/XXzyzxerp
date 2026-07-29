export const logisticsQueueKeys = ["all", "critical", "high", "normal", "unhandled"] as const;
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
};

export const defaultLogisticsWorkbenchConfig: LogisticsWorkbenchConfig = {
  quickTags: ["已通知客户", "无人接听", "等待客户回复", "地址已确认", "需再次跟进"],
  cards: [
    { key: "all", label: "全部追踪", isVisible: true, sortOrder: 10 },
    { key: "critical", label: "超期高风险", isVisible: true, sortOrder: 20 },
    { key: "high", label: "需立即跟进", isVisible: true, sortOrder: 30 },
    { key: "normal", label: "正常运输", isVisible: true, sortOrder: 40 },
    { key: "unhandled", label: "存在未处理轨迹", isVisible: true, sortOrder: 50 },
  ],
};

export function parseLogisticsWorkbenchConfig(raw: { quickTags?: unknown; cards?: unknown } | null | undefined): LogisticsWorkbenchConfig {
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
  return { quickTags, cards: [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder) };
}
