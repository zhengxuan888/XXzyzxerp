import { describe, expect, it } from "vitest";

import { structuredSuggestionFromGoogle } from "@/lib/google-address-components";

describe("structuredSuggestionFromGoogle", () => {
  it("splits a validated Iberian address into logistics fields", () => {
    expect(structuredSuggestionFromGoogle({
      formattedAddress: "Calle de Alcalá 123, 4º B, 28009 Madrid, Spain",
      postalAddress: {
        regionCode: "ES",
        postalCode: "28009",
        administrativeArea: "Comunidad de Madrid",
        locality: "Madrid",
        sublocality: "Salamanca",
        addressLines: ["Calle de Alcalá 123, 4º B"],
      },
      addressComponents: [
        { componentType: "route", componentName: { text: "Calle de Alcalá" } },
        { componentType: "street_number", componentName: { text: "123" } },
        { componentType: "subpremise", componentName: { text: "4º B" } },
      ],
    })).toEqual({
      countryCode: "ES",
      postalCode: "28009",
      region: "Comunidad de Madrid",
      city: "Madrid",
      district: "Salamanca",
      street: "Calle de Alcalá",
      houseNumber: "123, 4º B",
      address: "Calle de Alcalá 123, 4º B",
      formattedAddress: "Calle de Alcalá 123, 4º B, 28009 Madrid, Spain",
    });
  });

  it("uses component-level district data and never invents missing values", () => {
    expect(structuredSuggestionFromGoogle({
      postalAddress: { regionCode: "PT", locality: "Lisboa" },
      addressComponents: [
        { componentType: "route", componentName: { text: "Rua Augusta" } },
        { componentType: "street_number", componentName: { text: "88" } },
        { componentType: "sublocality_level_1", componentName: { text: "Santa Maria Maior" } },
      ],
    })).toMatchObject({
      countryCode: "PT",
      city: "Lisboa",
      district: "Santa Maria Maior",
      street: "Rua Augusta",
      houseNumber: "88",
      address: "Rua Augusta, 88, Santa Maria Maior",
      postalCode: "",
      region: "",
    });
  });
});
