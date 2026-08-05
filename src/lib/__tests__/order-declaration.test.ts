import { describe, expect, it } from "vitest";
import { declarationAmountEurCents } from "@/lib/order-declaration";

describe("declarationAmountEurCents", () => {
  it.each([
    [30_000, "EUR", 3_000],
    [100_000, "PLN", 2_311],
    [100_000, "CZK", 413],
    [100_000, "RON", 1_911],
  ])("converts %i cents of %s to EUR declaration cents", (amount, currency, expected) => {
    expect(declarationAmountEurCents(amount, currency)).toBe(expected);
  });

  it("rejects currencies without an approved fixed rate", () => {
    expect(() => declarationAmountEurCents(10_000, "USD")).toThrow("DECLARATION_RATE_NOT_CONFIGURED:USD");
  });
});
