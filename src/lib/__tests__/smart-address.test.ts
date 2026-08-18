import { describe, expect, it } from "vitest";

import { mergeNonEmptyAddressSuggestion, parseSmartAddressText } from "@/lib/smart-address";

describe("smart address parsing", () => {
  it("extracts Spanish contact hints while preserving the complete source text", () => {
    const source = [
      "María García",
      "Calle de Alcalá 123, 4º B",
      "28009 Madrid",
      "España",
      "+34 612 345 678",
      "maria@example.com",
    ].join("\n");

    expect(parseSmartAddressText(source)).toEqual({
      originalText: source,
      recipientName: "María García",
      recipientPhone: "+34 612 345 678",
      recipientEmail: "maria@example.com",
      countryCode: "ES",
      postalCode: "28009",
      city: "Madrid",
      address: "Calle de Alcalá 123, 4º B, 28009 Madrid, España",
    });
  });

  it("recognizes Portuguese postal codes and normalizes their separator", () => {
    const parsed = parseSmartAddressText([
      "João Silva",
      "Rua Augusta 88",
      "1100 053 Lisboa",
      "Portugal",
      "+351 912 345 678",
    ].join("\n"));

    expect(parsed).toMatchObject({
      recipientName: "João Silva",
      recipientPhone: "+351 912 345 678",
      countryCode: "PT",
      postalCode: "1100-053",
      city: "Lisboa",
    });
    expect(parsed.address).toContain("Rua Augusta 88");
  });

  it("does not mistake a Portuguese postal code for a phone when no phone is present", () => {
    const parsed = parseSmartAddressText([
      "João Silva",
      "Rua Augusta 88",
      "1100-053 Lisboa",
      "Portugal",
    ].join("\n"));

    expect(parsed).toMatchObject({
      recipientPhone: "",
      countryCode: "PT",
      postalCode: "1100-053",
      city: "Lisboa",
    });
    expect(parsed.address).toContain("1100-053 Lisboa");
  });

  it("extracts a city when punctuation separates it from the postal code", () => {
    const parsed = parseSmartAddressText([
      "María García",
      "Calle de Alcalá 123",
      "28009, Madrid",
      "España",
      "+34 612 345 678",
    ].join("\n"));

    expect(parsed).toMatchObject({
      recipientPhone: "+34 612 345 678",
      postalCode: "28009",
      city: "Madrid",
    });
  });

  it("does not treat a Portuguese street number as a Spanish phone prefix", () => {
    const parsed = parseSmartAddressText([
      "João Silva",
      "34 Rua Augusta",
      "1100-053 Lisboa",
    ].join("\n"));

    expect(parsed).toMatchObject({
      recipientPhone: "",
      countryCode: "PT",
      postalCode: "1100-053",
      city: "Lisboa",
    });
  });

  it("does not treat a Spanish street number as a Portuguese phone prefix", () => {
    const parsed = parseSmartAddressText([
      "María García",
      "351 Calle de Alcalá 123",
      "28009 Madrid",
    ].join("\n"));

    expect(parsed).toMatchObject({
      recipientPhone: "",
      countryCode: "ES",
      postalCode: "28009",
      city: "Madrid",
    });
  });

  it("honors an explicit employee-selected country over a weak textual inference", () => {
    expect(parseSmartAddressText("Rua Demo 1\n28009 Madrid", "PT").countryCode).toBe("PT");
  });

  it("never clears employee-entered components when a suggestion is partial", () => {
    expect(mergeNonEmptyAddressSuggestion(
      { countryCode: "ES", postalCode: "28009", region: "Madrid", city: "Madrid", address: "Calle 1" },
      { countryCode: "", postalCode: "", region: "Comunidad de Madrid", city: "", address: "" },
    )).toEqual({
      countryCode: "ES",
      postalCode: "28009",
      region: "Comunidad de Madrid",
      city: "Madrid",
      address: "Calle 1",
    });
  });
});
