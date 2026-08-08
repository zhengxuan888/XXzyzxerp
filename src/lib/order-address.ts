function normalizedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/** Keep the customer's original address as a write-once audit snapshot. */
export function preserveOriginalAddress(
  existing: string | null | undefined,
  incoming: unknown,
) {
  if (existing) return existing;
  return normalizedText(incoming, 1000);
}
