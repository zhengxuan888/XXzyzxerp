export type GoogleAddressComponent = {
  componentName?: { text?: string };
  componentType?: string;
};

export type GooglePostalAddress = {
  regionCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  addressLines?: string[];
};

export type GoogleValidatedAddress = {
  formattedAddress?: string;
  postalAddress?: GooglePostalAddress;
  addressComponents?: GoogleAddressComponent[];
};

export type StructuredAddressSuggestion = {
  countryCode: string;
  postalCode: string;
  region: string;
  city: string;
  district: string;
  street: string;
  houseNumber: string;
  address: string;
  formattedAddress: string;
};

const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

function componentValue(components: readonly GoogleAddressComponent[], types: readonly string[], max = 120) {
  for (const type of types) {
    const value = components.find((component) => component.componentType === type)?.componentName?.text;
    if (value?.trim()) return clean(value, max);
  }
  return "";
}

function uniqueParts(parts: readonly string[]) {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const normalized = part.trim().toLocaleLowerCase("en-US");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Converts Google's unordered address components into the stable fields used
 * by orders and logistics exports. Missing components stay empty so callers
 * can preserve employee-entered values instead of erasing them.
 */
export function structuredSuggestionFromGoogle(
  address: GoogleValidatedAddress | undefined,
  fallbackCountryCode = "",
): StructuredAddressSuggestion {
  const postal = address?.postalAddress;
  const components = address?.addressComponents ?? [];
  const street = componentValue(components, ["route"], 300);
  const district = clean(postal?.sublocality, 100) || componentValue(components, [
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "sublocality_level_3",
    "sublocality_level_4",
    "sublocality_level_5",
    "administrative_area_level_3",
    "neighborhood",
  ], 100);
  const houseNumber = uniqueParts([
    componentValue(components, ["street_number"], 80),
    componentValue(components, ["premise"], 120),
    componentValue(components, ["subpremise"], 120),
    componentValue(components, ["floor"], 80),
    componentValue(components, ["room"], 80),
  ]).join(", ");
  const addressLines = (postal?.addressLines ?? []).map((line) => clean(line)).filter(Boolean);
  const combinedAddress = addressLines.join(", ") || uniqueParts([street, houseNumber, district]).join(", ");

  return {
    countryCode: (clean(postal?.regionCode, 2) || clean(fallbackCountryCode, 2)).toUpperCase(),
    postalCode: clean(postal?.postalCode, 30),
    region: clean(postal?.administrativeArea, 100),
    city: clean(postal?.locality, 100),
    district,
    street,
    houseNumber,
    address: clean(combinedAddress, 500),
    formattedAddress: clean(address?.formattedAddress, 500),
  };
}
