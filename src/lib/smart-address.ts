export type SmartAddressResult = {
  originalText: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  countryCode: string;
  postalCode: string;
  city: string;
  district: string;
  street: string;
  houseNumber: string;
  address: string;
};

export type StructuredAddress = {
  countryCode: string;
  postalCode: string;
  region: string;
  city: string;
  district: string;
  street: string;
  houseNumber: string;
  address: string;
};

const EMAIL_PATTERN = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/iu;
const PHONE_CANDIDATE_PATTERN = /(?:\+|00)?\d[\d\t ().-]{5,}\d/gu;
const PORTUGAL_POSTAL_PATTERN = /\b\d{4}[ -]\d{3}\b/u;
const SPAIN_POSTAL_PATTERN = /\b\d{5}\b/u;
const STREET_PREFIX_PATTERN = /^(?:calle|c\/?|avenida|avda\.?|av\.?|paseo|p\.?º|plaza|camino|carretera|ronda|rambla|traves[ií]a|urbanizaci[oó]n|rua|travessa|pra[cç]a|estrada|largo|alameda|beco|cal[cç]ada)\b/iu;
const HOUSE_NUMBER_SOURCE = String.raw`(?:n(?:[.º°o]|úm(?:ero)?)?\s*)?(?:\d{1,5}(?:\s*[-/]\s*\d{1,5})?[a-z]?|s\s*\/\s*n)`;
const DISTRICT_LABEL_PATTERN = /^(?:distrito|barrio|bairro|freguesia|concelho|parroquia|par[oó]quia)\s*(?:(?:de|do|da)\s+)?[:：,\-]?\s*(.+)$/iu;

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

function compactHouseNumber(value: string) {
  return value.replace(/\s*\/\s*/gu, "/").replace(/\s{2,}/gu, " ").trim();
}

function looksLikeUnitSuffix(value: string) {
  const suffix = value.replace(/^[\s,;\-]+/u, "").replace(/[\s,;]+$/u, "").trim();
  if (!suffix) return true;
  if (suffix.length > 50) return false;

  // A suffix is accepted only when every token looks like a floor, door,
  // staircase, apartment, block or left/right qualifier. This intentionally
  // rejects place names so a city or district is never swallowed into the
  // house-number field.
  const tokens = suffix.split(/[\s,;]+/u).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => {
    const normalized = token.replace(/^[#(]+|[).]+$/gu, "");
    return /^(?:\d{1,3}(?:[-/]\d{1,3})?[a-z]?|\d{1,2}(?:\.?[º°ª]|[oa])|[a-z]|piso|planta|andar|porta|puerta|apto|apartamento|frac[cç][aã]o|bloco|bloque|esc(?:alera)?|esq(?:\.?|uerdo|uerda)?|izq(?:\.?|uierdo|uierda)?|dto\.?|dcha?\.?|der(?:\.?|echo|echa)?|frente|tras|bajo|baixo|entresuelo)$/iu.test(normalized);
  });
}

function splitStreetLine(line: string) {
  const candidate = line.replace(/^[\s,;]+|[\s,;]+$/gu, "").trim();
  if (!candidate || candidate.length > 200) return null;

  // Some pasted Portuguese addresses put the number first (for example,
  // `34 Rua Augusta`). Accept that form only when the remaining street text
  // contains no other digit; otherwise the interpretation is ambiguous.
  const leadingPattern = new RegExp(`^(${HOUSE_NUMBER_SOURCE})[\\s,;\\-]+(.+)$`, "iu");
  const leading = candidate.match(leadingPattern);
  if (leading && STREET_PREFIX_PATTERN.test(leading[2]) && !/\d/u.test(leading[2])) {
    return { street: leading[2].trim(), houseNumber: compactHouseNumber(leading[1]) };
  }

  if (!STREET_PREFIX_PATTERN.test(candidate)) return null;

  const numberPattern = new RegExp(HOUSE_NUMBER_SOURCE, "giu");
  for (const match of candidate.matchAll(numberPattern)) {
    const index = match.index ?? -1;
    if (index <= 0) continue;
    const street = candidate.slice(0, index).replace(/[\s,;\-]+$/gu, "").trim();
    const suffix = candidate.slice(index + match[0].length);
    if (!street || !STREET_PREFIX_PATTERN.test(street) || !looksLikeUnitSuffix(suffix)) continue;
    return {
      street,
      houseNumber: compactHouseNumber(`${match[0]}${suffix}`.replace(/^[\s,;]+|[\s,;]+$/gu, "")),
    };
  }

  // A well-known street prefix is enough to identify the street itself, but
  // never invent a house number when none can be separated safely.
  if (!PORTUGAL_POSTAL_PATTERN.test(candidate) && !SPAIN_POSTAL_PATTERN.test(candidate)) {
    return { street: candidate, houseNumber: "" };
  }
  return null;
}

function addressAnalysisCandidates(lines: readonly string[]) {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const append = (value: string) => {
    const candidate = value.trim();
    const key = candidate.toLocaleLowerCase("en-US");
    if (!candidate || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const line of lines) {
    append(line);
    const parts = line.split(/\s*[,;]\s*/u).map((part) => part.trim()).filter(Boolean);
    for (let start = 0; start < parts.length; start += 1) {
      // Joining adjacent parts keeps a floor/door suffix beside its street
      // number while allowing a leading name to be skipped in one-line text.
      for (let length = Math.min(3, parts.length - start); length >= 1; length -= 1) {
        append(parts.slice(start, start + length).join(", "));
      }
    }
  }
  return candidates;
}

function extractDistrict(lines: readonly string[]) {
  for (const line of addressAnalysisCandidates(lines)) {
    const match = line.match(DISTRICT_LABEL_PATTERN);
    const candidate = match?.[1]?.trim().replace(/[.,;]+$/gu, "") ?? "";
    if (!candidate || candidate.length > 100 || /\d/u.test(candidate)) continue;
    if (PORTUGAL_POSTAL_PATTERN.test(candidate) || SPAIN_POSTAL_PATTERN.test(candidate)) continue;
    return candidate;
  }
  return "";
}

function extractStreetParts(lines: readonly string[]) {
  for (const line of addressAnalysisCandidates(lines)) {
    const result = splitStreetLine(line);
    if (result) return result;
  }
  return { street: "", houseNumber: "" };
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
      district: "",
      street: "",
      houseNumber: "",
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
  const district = extractDistrict(addressLines);
  const { street, houseNumber } = extractStreetParts(addressLines);

  return {
    originalText,
    recipientName,
    recipientPhone,
    recipientEmail,
    countryCode,
    postalCode,
    city,
    district,
    street,
    houseNumber,
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
    district: value(suggestion.district, current.district),
    street: value(suggestion.street, current.street),
    houseNumber: value(suggestion.houseNumber, current.houseNumber),
    address: value(suggestion.address, current.address),
  };
}
