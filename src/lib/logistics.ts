import type { LogisticsIssueSeverity, ShipmentStatus } from "@prisma/client";

export type ShipmentEventPriority = "LOW" | "MEDIUM" | "HIGH";
export type ShipmentEventSeverity = "LOW" | "MEDIUM" | "HIGH";

export type ShipmentEventInput = {
  eventType: ShipmentEventType;
  status: ShipmentStatus;
  occurredAt: Date;
  location: string | null;
  memo: string | null;
  exceptionReason: string | null;
  exceptionSeverity: LogisticsIssueSeverity | null;
};

export type LogisticsAlertRule = {
  key: string;
  matches: string[];
  milestoneEvent: ShipmentEventType;
  silentWorkDaysBeforeMilestone: number;
};

type ShipmentEventMeta = {
  status: ShipmentStatus;
  workStatus: "MONITORING" | "NEEDS_ATTENTION" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "WAITING_CARRIER" | "RESOLVED" | "NO_ACTION_REQUIRED" | "CLOSED";
  priority: ShipmentEventPriority;
};

const EVENT_DEFS = {
  SHIPMENT_CREATED: { status: "PENDING", workStatus: "MONITORING", priority: "LOW" as const },
  TRACKING_NUMBER_ASSIGNED: { status: "PENDING", workStatus: "MONITORING", priority: "LOW" as const },
  PICKED_UP: { status: "PICKED_UP", workStatus: "MONITORING", priority: "LOW" as const },
  IN_TRANSIT: { status: "IN_TRANSIT", workStatus: "MONITORING", priority: "LOW" as const },
  OUT_FOR_DELIVERY: { status: "OUT_FOR_DELIVERY", workStatus: "IN_PROGRESS", priority: "HIGH" as const },
  DELIVERED: { status: "DELIVERED", workStatus: "CLOSED", priority: "LOW" as const },
  EXCEPTION: { status: "EXCEPTION", workStatus: "NEEDS_ATTENTION", priority: "HIGH" as const },
  CANCELED: { status: "CANCELLED", workStatus: "CLOSED", priority: "LOW" as const },
  RETURNING: { status: "RETURNING", workStatus: "WAITING_CARRIER", priority: "HIGH" as const },
  RETURNED: { status: "RETURNED", workStatus: "RESOLVED", priority: "MEDIUM" as const },
  ADDRESS_ERROR: { status: "EXCEPTION", workStatus: "WAITING_CUSTOMER", priority: "HIGH" as const },
  CUSTOMER_ABSENT: { status: "EXCEPTION", workStatus: "WAITING_CUSTOMER", priority: "HIGH" as const },
  REFUSED: { status: "EXCEPTION", workStatus: "NEEDS_ATTENTION", priority: "HIGH" as const },
} as const;

type AlertRuleSource = Omit<LogisticsAlertRule, "key" | "milestoneEvent"> & {
  key: string;
  milestoneEvent: string;
};

export const DEFAULT_ALERT_RULES: LogisticsAlertRule[] = [
  { key: "GREECE", matches: ["greece", "希腊"], milestoneEvent: "DELIVERED", silentWorkDaysBeforeMilestone: 3 },
  { key: "CZECH", matches: ["czech", "捷克"], milestoneEvent: "OUT_FOR_DELIVERY", silentWorkDaysBeforeMilestone: 3 },
  { key: "POLAND", matches: ["poland", "波兰"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 3 },
  { key: "SLOVAKIA", matches: ["slovakia", "斯洛伐克"], milestoneEvent: "PICKED_UP", silentWorkDaysBeforeMilestone: 3 },
  { key: "ITALY", matches: ["italy", "意大利"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 3 },
  { key: "SPAIN", matches: ["spain", "西班牙"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 2 },
  { key: "PORTUGAL", matches: ["portugal", "葡萄牙"], milestoneEvent: "IN_TRANSIT", silentWorkDaysBeforeMilestone: 2 },
];

export type ParsedAlertRuleParseResult = {
  rules: LogisticsAlertRule[];
  invalidEntries: number;
  hasInvalidPayload: boolean;
};

function parseAlertRuleConfig(): ParsedAlertRuleParseResult {
  const raw = process.env.LOGISTICS_COUNTRY_ALERT_RULES;
  if (!raw) {
    return { rules: DEFAULT_ALERT_RULES, invalidEntries: 0, hasInvalidPayload: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { rules: DEFAULT_ALERT_RULES, invalidEntries: 1, hasInvalidPayload: true };
    }

    let invalidEntries = 0;
    const normalized = parsed
      .map((entry: unknown): LogisticsAlertRule | null => {
        if (!entry || typeof entry !== "object") return null;
        const rule = entry as AlertRuleSource;
        const key = typeof rule.key === "string" ? rule.key.trim() : "";
        const milestoneEvent = typeof rule.milestoneEvent === "string" ? rule.milestoneEvent.trim().toUpperCase() : "";
        const rawDays = typeof rule.silentWorkDaysBeforeMilestone === "number" ? rule.silentWorkDaysBeforeMilestone : null;
        const matches = Array.isArray(rule.matches)
          ? rule.matches
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];

        if (
          !key ||
          !milestoneEvent ||
          !(milestoneEvent in EVENT_DEFS) ||
          !matches.length ||
          rawDays === null ||
          Number.isNaN(rawDays) ||
          !Number.isFinite(rawDays) ||
          rawDays < 0
        ) {
          invalidEntries += 1;
          return null;
        }

        return {
          key,
          matches,
          milestoneEvent: milestoneEvent as ShipmentEventType,
          silentWorkDaysBeforeMilestone: Math.floor(rawDays),
        };
      })
      .filter((entry): entry is LogisticsAlertRule => entry !== null);

    if (!normalized.length) {
      return { rules: DEFAULT_ALERT_RULES, invalidEntries, hasInvalidPayload: true };
    }

    return {
      rules: normalized,
      invalidEntries,
      hasInvalidPayload: invalidEntries > 0,
    };
  } catch {
    return { rules: DEFAULT_ALERT_RULES, invalidEntries: 1, hasInvalidPayload: true };
  }
}
export type ShipmentEventType = keyof typeof EVENT_DEFS;

export const HIGH_PRIORITY_SHIPMENT_EVENTS = Object.entries(EVENT_DEFS)
  .filter(([, value]) => value.priority === "HIGH")
  .map(([key]) => key as ShipmentEventType);

export const shipmentEventMeta: Record<ShipmentEventType, ShipmentEventMeta> = EVENT_DEFS;

export type ShipmentEventHistoryPoint = {
  eventType: ShipmentEventType;
  occurredAt: Date;
};

export type AlertContext = {
  highPriorityIndex: number;
  isDuplicate: boolean;
  isOutOfOrder: boolean;
};

export function resolveHighPriorityIndex(
  history: ShipmentEventHistoryPoint[] | null | undefined,
  current: ShipmentEventHistoryPoint,
): AlertContext {
  if (shipmentEventMeta[current.eventType].priority !== "HIGH") {
    return { highPriorityIndex: 0, isDuplicate: false, isOutOfOrder: false };
  }

  const normalizedHistory = (history ?? [])
    .filter((entry): entry is ShipmentEventHistoryPoint =>
      HIGH_PRIORITY_SHIPMENT_EVENTS.includes(entry.eventType) &&
      entry.occurredAt instanceof Date &&
      Number.isFinite(entry.occurredAt.getTime()),
    )
    .map((entry) => ({
      ...entry,
      occurredAt: new Date(entry.occurredAt),
    }));

  const isOutOfOrder = normalizedHistory.some((event) => event.occurredAt.getTime() > current.occurredAt.getTime());

  const timeline = [...normalizedHistory, current].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.eventType.localeCompare(right.eventType),
  );
  const seen = new Set<string>();
  const deduped: ShipmentEventHistoryPoint[] = [];
  for (const event of timeline) {
    const key = `${event.eventType}|${event.occurredAt.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  const currentKey = `${current.eventType}|${current.occurredAt.toISOString()}`;
  const duplicateCount = timeline.filter((entry) => `${entry.eventType}|${entry.occurredAt.toISOString()}` === currentKey).length;
  const isDuplicate = duplicateCount > 1;
  const index = deduped.findIndex((entry) => `${entry.eventType}|${entry.occurredAt.toISOString()}` === currentKey);

  return {
    highPriorityIndex: index >= 0 ? index + 1 : deduped.length + 1,
    isDuplicate,
    isOutOfOrder,
  };
}
export function getHighPrioritySilenceLimit(): number {
  const value = Number(process.env.LOGISTICS_HIGH_PRIORITY_INITIAL_SILENCE);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function getAlertRuleForShipmentLocation(input: string | null | undefined): LogisticsAlertRule | null {
  const value = input?.trim().toLowerCase();
  if (!value) return null;
  const { rules } = parseAlertRuleConfig();
  return rules.find((rule) => rule.matches.some((keyword) => value.includes(keyword.toLowerCase()))) ?? null;
}

export function pickAlertRuleKeyFromLocation(input: string | null | undefined): string | null {
  const rule = getAlertRuleForShipmentLocation(input);
  return rule?.key ?? null;
}

export function getInitialReminderHours(silentWorkDaysBeforeMilestone: number): number {
  return Math.max(1, Math.ceil(silentWorkDaysBeforeMilestone * 24));
}

export function getParsedAlertRuleConfig(): ParsedAlertRuleParseResult {
  return parseAlertRuleConfig();
}

export function shouldSuppressHighPriorityFollowUp(
  eventType: ShipmentEventType,
  options: {
    highPriorityIndex?: number;
    countryRuleName: string | null;
    hasActiveHighPriorityFollowUp: boolean;
    isMilestoneReached: boolean;
    firstTrackedAt: Date | null;
    lastTrackedAt: Date | null;
    occurredAt: Date;
  },
): boolean {
  if (shipmentEventMeta[eventType].priority !== "HIGH") return false;
  if (options.isMilestoneReached) return false;
  if (options.hasActiveHighPriorityFollowUp) return false;

  const rule = options.countryRuleName ? parseAlertRuleConfig().rules.find((entry) => entry.key === options.countryRuleName) : null;
  if (!rule) {
    const silenceLimit = getHighPrioritySilenceLimit();
    const highPriorityIndex = options.highPriorityIndex ?? 0;
    if (!silenceLimit) return false;
    return highPriorityIndex <= silenceLimit;
  }

  const workBaseTime = options.lastTrackedAt ?? options.firstTrackedAt;
  if (!workBaseTime) return false;
  const silenceWindowHours = getInitialReminderHours(rule.silentWorkDaysBeforeMilestone);
  const passedHours = (options.occurredAt.getTime() - workBaseTime.getTime()) / (60 * 60 * 1000);
  return passedHours < silenceWindowHours;
}

export function parseShipmentEventPayload(body: unknown): ShipmentEventInput {
  if (!body || typeof body !== "object") throw new Error("INVALID_SHIPMENT_EVENT");
  const value = body as Record<string, unknown>;
  const eventType = typeof value.eventType === "string" ? value.eventType.trim().toUpperCase() : "";

  if (!(eventType in EVENT_DEFS)) {
    throw new Error("INVALID_SHIPMENT_EVENT_TYPE");
  }

  const occurredAt = value.occurredAt ? new Date(String(value.occurredAt)) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("INVALID_OCCURRED_AT");
  }

  const severity = value.exceptionSeverity == null ? null : String(value.exceptionSeverity).toUpperCase();
  if (severity !== null && !["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    throw new Error("INVALID_EXCEPTION_SEVERITY");
  }

  const exceptionReason = typeof value.exceptionReason === "string" ? value.exceptionReason.trim() : null;
  const isException = EVENT_DEFS[eventType as ShipmentEventType].status === "EXCEPTION";
  if (isException && !exceptionReason) {
    throw new Error("EXCEPTION_REASON_REQUIRED");
  }

  const config = EVENT_DEFS[eventType as ShipmentEventType];

  return {
    eventType: eventType as ShipmentEventType,
    status: config.status,
    occurredAt,
    location: typeof value.location === "string" ? value.location.trim() || null : null,
    memo: typeof value.memo === "string" ? value.memo.trim() || null : null,
    exceptionReason,
    exceptionSeverity: severity as LogisticsIssueSeverity | null,
  };
}
