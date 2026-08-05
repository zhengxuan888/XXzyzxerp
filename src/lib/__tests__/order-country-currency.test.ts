import { describe, expect, it } from "vitest";
import { currencyForCountry } from "@/lib/order-country-currency";

describe("currencyForCountry", () => {
  it.each(["ES", "PT", "HR", "GR", "IT", "BG"])("uses EUR for %s", (country) => {
    expect(currencyForCountry(country)).toBe("EUR");
  });

  it.each([
    ["PL", "PLN"],
    ["CZ", "CZK"],
    ["RO", "RON"],
  ])("maps %s to %s", (country, currency) => {
    expect(currencyForCountry(country)).toBe(currency);
  });

  it("normalizes country codes and preserves a configured fallback", () => {
    expect(currencyForCountry(" pl ")).toBe("PLN");
    expect(currencyForCountry("XX", "USD")).toBe("USD");
  });
});
