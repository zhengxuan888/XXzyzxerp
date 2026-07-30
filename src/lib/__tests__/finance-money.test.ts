import { describe, expect, it } from "vitest";

import {
  FinanceMoneyValidationError,
  formatMinorAmount,
  parseCurrencyScale,
  parseMinorAmount,
  serializeMinorAmount,
} from "../finance/money";

describe("finance money invariants", () => {
  it("accepts only exact smallest-unit integers without number rounding", () => {
    const largeAmount = "900719925474099312345";

    expect(parseMinorAmount("12345")).toBe(BigInt("12345"));
    expect(parseMinorAmount(12345)).toBe(BigInt("12345"));
    expect(parseMinorAmount(largeAmount)).toBe(BigInt(largeAmount));
    expect(serializeMinorAmount(parseMinorAmount(largeAmount))).toBe(largeAmount);
  });

  it("rejects zero by default and accepts it only when the caller explicitly permits it", () => {
    expect(() => parseMinorAmount("0")).toThrow(FinanceMoneyValidationError);
    expect(parseMinorAmount("0", "amountCents", { allowZero: true })).toBe(BigInt("0"));
  });

  it("rejects fractional, scientific-notation, negative, and unsafe number inputs", () => {
    for (const value of [
      "12.34",
      "1.0",
      "1e3",
      "1E3",
      "-1",
      "+1",
      "",
      "  ",
      12.34,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      null,
    ]) {
      expect(() => parseMinorAmount(value)).toThrow(FinanceMoneyValidationError);
    }
  });

  it("formats and serializes amounts without exposing bigint to JSON callers", () => {
    expect(formatMinorAmount(BigInt("123456"), "eur", 2)).toBe("EUR 1,234.56");
    expect(formatMinorAmount(BigInt("42"), "jpy", 0)).toBe("JPY 42");
    expect(formatMinorAmount(BigInt("-123"), "usd", 2)).toBe("-USD 1.23");
    expect(parseCurrencyScale("0")).toBe(0);
    expect(parseCurrencyScale(undefined)).toBe(2);
  });
});
