export type OrderContactHistoryRow = {
  id: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  customerWhatsapp: string | null;
  recipientCountryCode: string | null;
  createdAt: Date;
};

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || "";
}

function normalizePhone(value: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 ? digits : trimmed.toLowerCase().replace(/[\s()-]+/g, "");
}

export function orderContactKeys(order: Pick<OrderContactHistoryRow, "recipientEmail" | "recipientPhone" | "customerWhatsapp" | "recipientCountryCode">) {
  const country = order.recipientCountryCode?.trim().toUpperCase() || "?";
  const email = normalizeEmail(order.recipientEmail);
  const phone = normalizePhone(order.recipientPhone);
  const whatsapp = normalizePhone(order.customerWhatsapp);
  return [...new Set([
    email ? `email:${email}` : "",
    phone ? `phone:${country}:${phone}` : "",
    whatsapp ? `phone:${country}:${whatsapp}` : "",
  ].filter(Boolean))];
}

export function businessDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function classifyOrderContactHistory(candidate: OrderContactHistoryRow, history: OrderContactHistoryRow[]) {
  const candidateKeys = new Set(orderContactKeys(candidate));
  if (!candidateKeys.size) return { duplicate: false, repeat: false, matchedOrderCount: 0 };
  const candidateDay = businessDateKey(candidate.createdAt);
  let duplicate = false;
  let repeat = false;
  let matchedOrderCount = 0;

  for (const historical of history) {
    if (historical.id === candidate.id) continue;
    if (!orderContactKeys(historical).some((key) => candidateKeys.has(key))) continue;
    matchedOrderCount += 1;
    const historicalDay = businessDateKey(historical.createdAt);
    if (historicalDay === candidateDay) duplicate = true;
    if (historical.createdAt.getTime() < candidate.createdAt.getTime() && historicalDay < candidateDay) repeat = true;
  }

  // A same-day collision is operationally a duplicate even when the same
  // customer also has older purchases. The repeat reminder remains available
  // once there is no duplicate collision requiring review.
  return { duplicate, repeat: !duplicate && repeat, matchedOrderCount };
}
