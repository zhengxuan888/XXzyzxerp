import { describe, expect, it } from "vitest";

import { isWithinReportRange, shanghaiReportRanges } from "@/lib/after-sales-report";

describe("after-sales report time ranges", () => {
  it("uses Asia/Shanghai day and month boundaries", () => {
    const range = shanghaiReportRanges(new Date("2026-08-02T16:30:00.000Z"));
    expect(range.date).toBe("2026-08-03");
    expect(range.today.toISOString()).toBe("2026-08-02T16:00:00.000Z");
    expect(range.tomorrow.toISOString()).toBe("2026-08-03T16:00:00.000Z");
    expect(range.monthStart.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(range.previousMonthStart.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("includes the start boundary and excludes the end boundary", () => {
    const start = new Date("2026-08-02T16:00:00.000Z");
    const end = new Date("2026-08-03T16:00:00.000Z");
    expect(isWithinReportRange(start, start, end)).toBe(true);
    expect(isWithinReportRange(new Date(end.getTime() - 1), start, end)).toBe(true);
    expect(isWithinReportRange(end, start, end)).toBe(false);
    expect(isWithinReportRange(null, start, end)).toBe(false);
  });

  it("uses a selected Shanghai calendar date", () => {
    const range = shanghaiReportRanges(new Date("2026-08-08T08:00:00.000Z"), "2026-07-31");
    expect(range.date).toBe("2026-07-31");
    expect(range.today.toISOString()).toBe("2026-07-30T16:00:00.000Z");
    expect(range.tomorrow.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(range.monthStart.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("rejects an invalid selected date", () => {
    expect(() => shanghaiReportRanges(new Date(), "2026-02-31")).toThrow("INVALID_REPORT_DATE");
  });
});
