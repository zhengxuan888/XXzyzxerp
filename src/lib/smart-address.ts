export type SmartAddressResult = {
  originalText: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  countryCode: string;
  postalCode: string;
  city: string;
  address: string;
};

export type StructuredAddress = {
  countryCode: string;
  postalCode: string;
  region: string;
  city: string;
  address: string;
};

const EMAIL_PATTERN = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/iu;
const PHONE_CANDIDATE_PATTERN = /(?:\+|00)?\d[\d\t ().-]{5,}\d/gu;
const PORTUGAL_POSTAL_PATTERN = /\b\d{4}[ -]\d{3}\b/u;
const SPAIN_POSTAL_PATTERN = /\b\d{5}\b/u;

const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  ES: ["españa", "espana", "spain"],
  PT: ["portugal", "portuguese", "portuguesa", "português", "portugues"],
};

function normalizedCountryCode(value: string | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function phoneFromText(value: string) {
  const candidates = value.split(/\r?\n/u).flatMap((line) => {
    // A Portuguese postal code has seven digits and otherwise looks like a
    // plausible local telephone number. Remove postal tokens before applying
    // the deliberately broad phone matcher so `1100-053` is never copied into
    // the recipient-phone field or removed from the address.
    const withoutPostalCodes = line
      .replace(/\b\d{4}[ -]\d{3}\b/gu, " ")
      .replace(/\b\d{5}\b/gu, " ");
    return withoutPostalCodes.match(PHONE_CANDIDATE_PATTERN) ?? [];
  });
  const plausible = candidates.filter((candidate) => {
    const length = digits(candidate).length;
    return length >= 7 && length <= 15;
  });
  return (plausible.find((candidate) => /^(?:\+|00)/u.test(candidate.trim())) ?? plausible[0])?.trim() ?? "";
}

function detectCountryCode(text: string, preferredCountryCode?: string) {
  const preferred = normalizedCountryCode(preferredCountryCode);
  if (preferred) return preferred;

  const lower = text.toLocaleLowerCase("en-US");
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return code;
  }

  if (PORTUGAL_POSTAL_PATTERN.test(text)) return "PT";
  if (SPAIN_POSTAL_PATTERN.test(text)) return "ES";
  // Only an explicit international dialing prefix is strong enough to infer a
  // country. Flattening all digits made ordinary street numbers such as
  // `34 Rua Augusta` and `351 Calle ...` look like +34 / +351 phone numbers.
  if (/(?:^|\D)(?:\+351|00351)(?=\D|$)/u.test(text)) return "PT";
  if (/(?:^|\D)(?:\+34|0034)(?=\D|$)/u.test(text)) return "ES";
  return "";
}

function extractPostalAndCity(text: string, countryCode: string) {
  const pattern = countryCode === "PT" ? PORTUGAL_POSTAL_PATTERN : SPAIN_POSTAL_PATTERN;
  const match = pattern.exec(text);
  if (!match) return { postalCode: "", city: "" };

  const postalCode = countryCode === "PT" ? match[0].replace(" ", "-") : match[0];
  const afterPostal = text
    .slice((match.index ?? 0) + match[0].length)
    .replace(/^[\s,;|.\-–—]+/u, "");
  const city = afterPostal
    .split(/[\n,;|]/u, 1)[0]
    .replace(/^[\s-]+|[\s.-]+$/gu, "")
    .replace(/\b(?:españa|espana|spain|portugal)\b.*$/iu, "")
    .trim()
    .slice(0, 100);
  return { postalCode, city };
}

function looksLikeAddressLine(line: string) {
  return /\d/u.test(line)
    || /[,，]/u.test(line)
    || /\b(?:calle|c\/|avenida|av\.?|rua|travessa|praça|praca|estrada|street|road|avenue|plaza)\b/iu.test(line)
    || PORTUGAL_POSTAL_PATTERN.test(line)
    || SPAIN_POSTAL_PATTERN.test(line);
}

/**
 * Extracts contact hints from pasted customer text without pretending to be a
 * postal authority. The returned address remains deliberately generous and is
 * sent to the server-side address validator for the authoritative split.
 */
export function parseSmartAddressText(raw: string, preferredCountryCode?: string): SmartAddressResult {
  const originalText = raw.trim();
  if (!originalText) {
    return {
      originalText: "",
      recipientName: "",
      recipientPhone: "",
      recipientEmail: "",
      countryCode: normalizedCountryCode(preferredCountryCode),
      postalCode: "",
      city: "",
      address: "",
    };
  }

  const recipientEmail = originalText.match(EMAIL_PATTERN)?.[0] ?? "";
  const recipientPhone = phoneFromText(originalText);
  const lines = originalText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const contactFreeLines = lines.map((line) => {
    const withoutEmail = line.replace(EMAIL_PATTERN, " ");
    return (recipientPhone ? withoutEmail.replace(recipientPhone, " ") : withoutEmail)
      .replace(/^\s*(?:e-?mail|邮箱|correo|telefone|teléfono|telefono|phone|电话)\s*[:：-]?\s*/iu, "")
      .replace(/\s{2,}/gu, " ")
      .trim();
  });

  const firstContentIndex = contactFreeLines.findIndex(Boolean);
  const firstContent = firstContentIndex >= 0 ? contactFreeLines[firstContentIndex] : "";
  const remainingContentCount = contactFreeLines.filter(Boolean).length - (firstContent ? 1 : 0);
  const recipientName = firstContent
    && remainingContentCount > 0
    && !looksLikeAddressLine(firstContent)
    && !Object.values(COUNTRY_ALIASES).flat().some((alias) => firstContent.toLocaleLowerCase("en-US") === alias)
      ? firstContent.slice(0, 100)
      : "";

  const addressLines = contactFreeLines.filter((line, index) => {
    if (!line) return false;
    return !(recipientName && index === firstContentIndex);
  });
  const address = addressLines.join(", ").slice(0, 500);
  const countryCode = detectCountryCode(originalText, preferredCountryCode);
  const { postalCode, city } = extractPostalAndCity(address, countryCode || "ES");

  return {
    originalText,
    recipientName,
    recipientPhone,
    recipientEmail,
    countryCode,
    postalCode,
    city,
    address,
  };
}

/** Keeps employee-entered values whenever Google omits a component. */
export function mergeNonEmptyAddressSuggestion(
  current: StructuredAddress,
  suggestion: Partial<StructuredAddress>,
): StructuredAddress {
  const value = (next: unknown, fallback: string) => typeof next === "string" && next.trim()
    ? next.trim()
    : fallback;
  return {
    countryCode: value(suggestion.countryCode, current.countryCode).toUpperCase(),
    postalCode: value(suggestion.postalCode, current.postalCode),
    region: value(suggestion.region, current.region),
    city: value(suggestion.city, current.city),
    address: value(suggestion.address, current.address),
  };
}
