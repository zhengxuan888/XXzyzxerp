export function shanghaiReportRanges(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 60 * 60_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - 8 * 60 * 60_000);
  return {
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    today: at(year, month, day),
    tomorrow: at(year, month, day + 1),
    monthStart: at(year, month, 1),
    previousMonthStart: at(year, month - 1, 1),
  };
}

export function isWithinReportRange(value: Date | null, start: Date, end: Date) {
  return Boolean(value && value >= start && value < end);
}
