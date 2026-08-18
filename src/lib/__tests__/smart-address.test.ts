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
      district: "",
      street: "Calle de Alcalá",
      houseNumber: "123, 4º B",
      address: "Calle de Alcalá 123, 4º B, 28009 Madrid, España",
    });
  });

  it("extracts street, number, floor and door from a one-line customer address", () => {
    const parsed = parseSmartAddressText(
      "María García, Calle de Alcalá 123, 4º B, 28009 Madrid, España",
      "ES",
    );

    expect(parsed.street).toBe("Calle de Alcalá");
    expect(parsed.houseNumber).toBe("123, 4º B");
    expect(parsed.address).toContain("Calle de Alcalá 123, 4º B");
    expect(parsed.originalText).toContain("María García");
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
      district: "",
      street: "Rua Augusta",
      houseNumber: "88",
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

  it("conservatively splits a Spanish district, street, house number, floor and door", () => {
    const source = [
      "Lucía Martín",
      "Barrio de Salamanca",
      "Calle de Velázquez 41, 3º Dcha.",
      "28001 Madrid",
      "España",
    ].join("\n");

    expect(parseSmartAddressText(source)).toMatchObject({
      originalText: source,
      countryCode: "ES",
      postalCode: "28001",
      city: "Madrid",
      district: "Salamanca",
      street: "Calle de Velázquez",
      houseNumber: "41, 3º Dcha.",
    });
    expect(parseSmartAddressText(source).address).toContain("Barrio de Salamanca");
  });

  it("conservatively splits a Portuguese street, number, floor and side", () => {
    const source = [
      "Ana Costa",
      "Freguesia: Santa Maria Maior",
      "Rua do Ouro 88, 2.º Esq.",
      "1100-063 Lisboa",
      "Portugal",
    ].join("\n");

    expect(parseSmartAddressText(source)).toMatchObject({
      originalText: source,
      countryCode: "PT",
      postalCode: "1100-063",
      city: "Lisboa",
      district: "Santa Maria Maior",
      street: "Rua do Ouro",
      houseNumber: "88, 2.º Esq.",
    });
  });

  it("keeps an ambiguous street line in the complete address instead of guessing", () => {
    const parsed = parseSmartAddressText([
      "María García",
      "Edificio Sol, entrada junto al mercado",
      "28009 Madrid",
      "España",
    ].join("\n"));

    expect(parsed).toMatchObject({ street: "", houseNumber: "" });
    expect(parsed.address).toContain("Edificio Sol, entrada junto al mercado");
  });

  it("never clears employee-entered components when a suggestion is partial", () => {
    expect(mergeNonEmptyAddressSuggestion(
      {
        countryCode: "ES",
        postalCode: "28009",
        region: "Madrid",
        city: "Madrid",
        district: "Salamanca",
        street: "Calle 1",
        houseNumber: "12, 2º B",
        address: "Calle 1, 12, 2º B",
      },
      {
        countryCode: "",
        postalCode: "",
        region: "Comunidad de Madrid",
        city: "",
        district: "",
        street: "",
        houseNumber: "",
        address: "",
      },
    )).toEqual({
      countryCode: "ES",
      postalCode: "28009",
      region: "Comunidad de Madrid",
      city: "Madrid",
      district: "Salamanca",
      street: "Calle 1",
      houseNumber: "12, 2º B",
      address: "Calle 1, 12, 2º B",
    });
  });
});
