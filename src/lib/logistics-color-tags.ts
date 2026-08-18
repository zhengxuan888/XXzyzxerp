export const logisticsColorTags = [
  { key: "in_transit", label: "在途", tags: ["在途"], tone: "border-slate-300 bg-transparent text-slate-700", cardTone: "border-slate-200 bg-white" },
  { key: "transporting", label: "运输中", tags: ["运输中"], tone: "border-slate-300 bg-transparent text-slate-700", cardTone: "border-slate-200 bg-white" },
  { key: "delivery_soon", label: "预计今明天送达", tags: ["预计今明天送达"], tone: "border-pink-200 bg-pink-50 text-pink-800", cardTone: "border-pink-200 bg-pink-50/40" },
  { key: "out_for_delivery", label: "派送中", tags: ["派送中"], tone: "border-pink-300 bg-pink-100 text-pink-800", cardTone: "border-pink-300 bg-pink-50/50" },
  { key: "ready_for_pickup", label: "到达代取", tags: ["到达代取", "到达待取"], tone: "border-blue-200 bg-blue-100 text-blue-800", cardTone: "border-blue-300 bg-blue-50/50" },
  { key: "delivered", label: "签收", tags: ["签收"], tone: "border-emerald-200 bg-emerald-50 text-emerald-800", cardTone: "border-emerald-200 bg-emerald-50/50" },
  { key: "refused", label: "拒收", tags: ["拒收"], tone: "border-red-300 bg-red-100 text-red-800", cardTone: "border-red-300 bg-red-50/50" },
  { key: "unread_no_reply", label: "不读不回", tags: ["不读不回"], tone: "border-yellow-300 bg-yellow-100 text-yellow-900", cardTone: "border-yellow-300 bg-yellow-50/60" },
  { key: "read_no_reply", label: "已读不回", tags: ["已读不回"], tone: "border-yellow-300 bg-yellow-100 text-yellow-900", cardTone: "border-yellow-300 bg-yellow-50/60" },
  { key: "delivery_failed", label: "派送失败", tags: ["派送失败"], tone: "border-yellow-300 bg-yellow-100 text-yellow-900", cardTone: "border-yellow-300 bg-yellow-50/60" },
  { key: "post_delivery_exception", label: "签收后异常", tags: ["签收后异常", "签收后退款"], tone: "border-purple-300 bg-purple-100 text-purple-800", cardTone: "border-purple-300 bg-purple-50/50" },
] as const;

export type LogisticsColorTagKey = (typeof logisticsColorTags)[number]["key"];

export const logisticsColorTagKeys = logisticsColorTags.map((tag) => tag.key);
export const logisticsColorQuickTagLabels = logisticsColorTags.map((tag) => tag.label);

const logisticsColorCardPriority: LogisticsColorTagKey[] = [
  "post_delivery_exception",
  "refused",
  "delivered",
  "delivery_failed",
  "unread_no_reply",
  "read_no_reply",
  "ready_for_pickup",
  "out_for_delivery",
  "delivery_soon",
  "transporting",
  "in_transit",
];

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function shanghaiDateKey(value: Date) {
  const parts = Object.fromEntries(shanghaiDateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseLogisticsColorTagKeys(value: string | null | undefined) {
  const allowed = new Set<string>(logisticsColorTagKeys);
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter((item): item is LogisticsColorTagKey => allowed.has(item)))];
}

export function classifyLogisticsColorTags(input: {
  status: string;
  estimatedDeliveryAt?: Date | string | null;
  orderExceptionNote?: string | null;
  signals?: Iterable<string>;
  latestEventType?: string | null;
  now?: Date;
}) {
  const matched = new Set<LogisticsColorTagKey>();
  const signals = new Set([...(input.signals ?? [])].map((signal) => signal.trim().toUpperCase()));
  const latestEventType = input.latestEventType?.trim().toUpperCase() ?? "";

  for (const definition of logisticsColorTags) {
    if (definition.tags.some((tag) => signals.has(`TAG:${tag.toUpperCase()}`))) matched.add(definition.key);
  }

  const progressKeys: LogisticsColorTagKey[] = ["in_transit", "transporting", "out_for_delivery", "ready_for_pickup", "delivered"];
  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", "RETURNING", "RETURNED", "CLOSED", "CANCELLED"].includes(input.status)) {
    for (const key of progressKeys) matched.delete(key);
  }
  if (["DELIVERED", "EXCEPTION", "RETURNING", "RETURNED", "CLOSED", "CANCELLED"].includes(input.status)) matched.delete("delivery_soon");

  if (input.status === "PICKED_UP") matched.add("in_transit");
  if (input.status === "IN_TRANSIT") matched.add("transporting");
  if (input.status === "OUT_FOR_DELIVERY") {
    matched.add(["AVAILABLE_FOR_PICKUP", "READY_FOR_PICKUP", "COD_READY"].includes(latestEventType) ? "ready_for_pickup" : "out_for_delivery");
  }
  if (input.status === "DELIVERED") {
    matched.delete("refused");
    matched.delete("delivery_failed");
    matched.add("delivered");
  }
  if (input.status === "EXCEPTION" && latestEventType === "REFUSED") matched.add("refused");
  if (input.status === "EXCEPTION" && ["DELIVERY_FAILED", "CUSTOMER_ABSENT"].includes(latestEventType)) matched.add("delivery_failed");
  if (input.orderExceptionNote === "签收后退款" || input.orderExceptionNote === "签收后异常") matched.add("post_delivery_exception");

  if (input.estimatedDeliveryAt && ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(input.status)) {
    const estimatedAt = new Date(input.estimatedDeliveryAt);
    const now = input.now ?? new Date();
    const todayKey = shanghaiDateKey(now);
    const tomorrowKey = shanghaiDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const estimatedKey = Number.isNaN(estimatedAt.getTime()) ? null : shanghaiDateKey(estimatedAt);
    if (estimatedKey === todayKey || estimatedKey === tomorrowKey) matched.add("delivery_soon");
  }

  return logisticsColorTagKeys.filter((key) => matched.has(key));
}

export function logisticsColorTagDefinition(key: string) {
  return logisticsColorTags.find((tag) => tag.key === key);
}

export function logisticsColorCardTone(keys: Iterable<string>) {
  const selected = new Set(keys);
  const primaryKey = logisticsColorCardPriority.find((key) => selected.has(key));
  return primaryKey ? logisticsColorTagDefinition(primaryKey)?.cardTone ?? "border-slate-200 bg-white" : "border-slate-200 bg-white";
}
