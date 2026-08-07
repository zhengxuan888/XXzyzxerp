export function shanghaiReportRanges(now = new Date(), selectedDate?: string | null) {
  const local = selectedDate ? parseShanghaiDate(selectedDate) : new Date(now.getTime() + 8 * 60 * 60_000);
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

function parseShanghaiDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("INVALID_REPORT_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month || parsed.getUTCDate() !== day) {
    throw new Error("INVALID_REPORT_DATE");
  }
  return parsed;
}

export function isWithinReportRange(value: Date | null, start: Date, end: Date) {
  return Boolean(value && value >= start && value < end);
}
