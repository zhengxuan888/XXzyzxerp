import { describe, expect, it } from "vitest";

import { normalizeMoneyCents } from "../money";

describe("money invariants", () => {
  it("accepts non-negative integer minor units without floating-point conversion", () => {
    expect(normalizeMoneyCents(12345)).toBe(12345);
    expect(normalizeMoneyCents("0")).toBe(0);
  });

  it("rejects fractions, negatives, unsafe integers, and malformed values", () => {
    for (const value of [1.2, -1, Number.MAX_SAFE_INTEGER + 1, "12.34", "invalid", null]) {
      expect(() => normalizeMoneyCents(value)).toThrow("INVALID_MONEY_CENTS");
    }
  });
});
