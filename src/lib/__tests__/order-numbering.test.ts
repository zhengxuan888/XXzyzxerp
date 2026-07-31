import { describe, expect, it } from "vitest";

import {
  chooseOrderNumberRule,
  formatOrderNumberDate,
  parseOrderNumberRuleInput,
  periodKeyForOrderNumber,
  renderOrderNumber,
} from "@/lib/order-numbering";

const now = new Date("2026-07-29T16:30:00.000Z"); // 2026-07-30 in Asia/Shanghai

describe("order numbering configuration", () => {
  it("renders a configurable prefix, non-padded date, department, and sequence", () => {
    const dateValue = formatOrderNumberDate(now, "YYYYMDD", "Asia/Shanghai");
    expect(dateValue).toBe("2026730");
    expect(renderOrderNumber({
      prefix: "ZY",
      dateValue,
      departmentCode: "SALES",
      includeDepartmentCode: true,
      separator: "-",
      sequencePadding: 3,
      sequence: 7,
    })).toBe("ZY2026730-SALES-007");
  });

  it("uses an atomic-counter key that resets at the configured period", () => {
    expect(periodKeyForOrderNumber(now, "DAILY", "Asia/Shanghai")).toBe("2026-07-30");
    expect(periodKeyForOrderNumber(now, "MONTHLY", "Asia/Shanghai")).toBe("2026-07");
    expect(periodKeyForOrderNumber(now, "YEARLY", "Asia/Shanghai")).toBe("2026");
    expect(periodKeyForOrderNumber(now, "NEVER", "Asia/Shanghai")).toBe("ALL");
  });

  it("prefers a matching department-and-template rule over general defaults", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const rule = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      code: id,
      prefix: "ZY",
      dateFormat: "YYYYMMDD",
      timeZone: "UTC",
      includeDepartmentCode: false,
      separator: "-",
      sequencePadding: 1,
      resetPeriod: "DAILY",
      priority: 0,
      isDefault: id === "default",
      departmentId: null,
      orderTemplateId: null,
      createdAt,
      ...overrides,
    });
    const selected = chooseOrderNumberRule([
      rule("default"),
      rule("department", { departmentId: "dept-a" }),
      rule("department-template", { departmentId: "dept-a", orderTemplateId: "template-a" }),
    ], { departmentId: "dept-a", orderTemplateId: "template-a" });
    expect(selected?.id).toBe("department-template");
  });

  it("rejects configurations that could reset to duplicate numbers", () => {
    const parsed = parseOrderNumberRuleInput({
      code: "GENERAL",
      name: "通用规则",
      prefix: "",
      dateFormat: "NONE",
      timeZone: "Asia/Shanghai",
      separator: "-",
      sequencePadding: 1,
      resetPeriod: "DAILY",
    });
    expect(parsed.errors).toContain("不含日期的编号只能使用“不重置”流水号，避免跨日重复。");
    expect(parsed.errors).toContain("编号至少需要前缀或日期段，不能只保留流水号。");
  });
});
