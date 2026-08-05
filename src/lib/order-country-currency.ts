const COUNTRY_CURRENCY: Record<string, string> = {
  ES: "EUR",
  PT: "EUR",
  HR: "EUR",
  GR: "EUR",
  IT: "EUR",
  BG: "EUR",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  GB: "GBP",
  CH: "CHF",
  SE: "SEK",
  DK: "DKK",
  NO: "NOK",
};

export function currencyForCountry(countryCode: string, fallback = "EUR") {
  return COUNTRY_CURRENCY[countryCode.trim().toUpperCase()] ?? fallback;
}
