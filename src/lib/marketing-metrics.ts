import { Prisma } from "@prisma/client";

export type MetricDefinitionInput = {
  id: string;
  code: string;
  name: string;
  valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
  calculation: "DIRECT" | "RATIO";
  numeratorMetricCode: string | null;
  denominatorMetricCode: string | null;
  multiplier: Prisma.Decimal | null;
  inputRequired: boolean;
  showOnWorkbench: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type StoredMetricValue = {
  metricDefinitionId: string;
  valueCents: bigint | null;
  valueDecimal: Prisma.Decimal | null;
};

export type NormalizedMetricInput = {
  metricDefinitionId: string;
  valueCents: bigint | null;
  valueDecimal: Prisma.Decimal | null;
};

const decimalInput = /^\d+(?:\.\d{1,6})?$/;
const moneyInput = /^\d+(?:\.(\d{1,2}))?$/;
const ZERO_CENTS = BigInt("0");
const HUNDRED_CENTS = BigInt("100");

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Parses money text exactly; JS floating point is never used for a money fact. */
export function parseMoneyToCents(value: unknown): bigint | null {
  const text = asTrimmedString(value);
  const matched = moneyInput.exec(text);
  if (!matched) return null;
  const [wholePart] = text.split(".");
  const fractionalPart = (matched[1] ?? "").padEnd(2, "0");
  try {
    return BigInt(wholePart) * HUNDRED_CENTS + BigInt(fractionalPart || "0");
  } catch {
    return null;
  }
}

export function parseDecimal(value: unknown): Prisma.Decimal | null {
  const text = asTrimmedString(value);
  if (!decimalInput.test(text)) return null;
  try {
    const parsed = new Prisma.Decimal(text);
    return parsed.greaterThanOrEqualTo(0) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeMetricInput({
  definition,
  value,
}: {
  definition: Pick<MetricDefinitionInput, "id" | "valueType" | "calculation">;
  value: unknown;
}): NormalizedMetricInput | null {
  // Ratios are derived from direct facts on the server; accepting them here
  // would permit an untraceable and potentially inconsistent KPI.
  if (definition.calculation !== "DIRECT") return null;
  if (definition.valueType === "MONEY_CENTS") {
    const valueCents = parseMoneyToCents(value);
    return valueCents == null ? null : { metricDefinitionId: definition.id, valueCents, valueDecimal: null };
  }
  const valueDecimal = parseDecimal(value);
  return valueDecimal == null ? null : { metricDefinitionId: definition.id, valueCents: null, valueDecimal };
}

export function centsToMoneyText(cents: bigint) {
  const sign = cents < ZERO_CENTS ? "-" : "";
  const absolute = cents < ZERO_CENTS ? -cents : cents;
  return `${sign}${absolute / HUNDRED_CENTS}.${(absolute % HUNDRED_CENTS).toString().padStart(2, "0")}`;
}

function toDecimal(value: StoredMetricValue | undefined) {
  if (!value) return new Prisma.Decimal(0);
  if (value.valueCents != null) return new Prisma.Decimal(value.valueCents.toString());
  return value.valueDecimal ?? new Prisma.Decimal(0);
}

export type CalculatedMetric = {
  id: string;
  code: string;
  name: string;
  valueType: MetricDefinitionInput["valueType"];
  calculation: MetricDefinitionInput["calculation"];
  valueCents: string | null;
  valueDecimal: string | null;
  isDerived: boolean;
};

/**
 * Returns JSON-safe raw and derived values. Ratio metrics are calculated only
 * after the raw numerator/denominator values are assembled, so future
 * aggregate queries can sum facts before calculating an overall ratio.
 */
export function calculateMetrics({
  definitions,
  values,
}: {
  definitions: MetricDefinitionInput[];
  values: StoredMetricValue[];
}): CalculatedMetric[] {
  const valuesByDefinitionId = new Map(values.map((value) => [value.metricDefinitionId, value]));
  const directValueByCode = new Map<string, Prisma.Decimal>();
  for (const definition of definitions) {
    if (definition.calculation === "DIRECT") {
      directValueByCode.set(definition.code, toDecimal(valuesByDefinitionId.get(definition.id)));
    }
  }

  return [...definitions]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
    .map((definition) => {
      if (definition.calculation === "DIRECT") {
        const stored = valuesByDefinitionId.get(definition.id);
        return {
          id: definition.id,
          code: definition.code,
          name: definition.name,
          valueType: definition.valueType,
          calculation: definition.calculation,
          valueCents: stored?.valueCents != null ? stored.valueCents.toString() : null,
          valueDecimal: stored?.valueDecimal?.toString() ?? null,
          isDerived: false,
        };
      }

      const numerator = definition.numeratorMetricCode ? directValueByCode.get(definition.numeratorMetricCode) : undefined;
      const denominator = definition.denominatorMetricCode ? directValueByCode.get(definition.denominatorMetricCode) : undefined;
      const multiplier = definition.multiplier ?? new Prisma.Decimal(1);
      const value = numerator && denominator && !denominator.isZero() ? numerator.dividedBy(denominator).mul(multiplier) : null;
      // Calculated money-per-unit values can contain fractions of the smallest
      // source unit. Keep them as Decimal for presentation and KPI comparison.
      const moneyCents = definition.valueType === "MONEY_CENTS" && value
        ? value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0)
        : null;
      return {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        valueType: definition.valueType,
        calculation: definition.calculation,
        // A money ratio such as CPA is still expressed in smallest currency
        // units. Returning cents keeps it exact and lets all screens format
        // it consistently, instead of accidentally displaying it 100x high.
        valueCents: moneyCents,
        valueDecimal: moneyCents == null ? value?.toDecimalPlaces(6).toString() ?? null : null,
        isDerived: true,
      };
    });
}

/** Aggregates raw report facts first, then derives ratios from the totals. */
export function aggregateMetricSets({
  definitions,
  valueSets,
}: {
  definitions: Array<MetricDefinitionInput & { aggregation: "SUM" | "AVG" | "LAST" }>;
  valueSets: StoredMetricValue[][];
}): CalculatedMetric[] {
  const byDefinitionId = new Map<string, StoredMetricValue[]>();
  for (const values of valueSets) {
    for (const value of values) byDefinitionId.set(value.metricDefinitionId, [...(byDefinitionId.get(value.metricDefinitionId) ?? []), value]);
  }
  const aggregated: StoredMetricValue[] = [];
  for (const definition of definitions) {
    if (definition.calculation !== "DIRECT") continue;
    const sourceValues = byDefinitionId.get(definition.id) ?? [];
    if (!sourceValues.length) continue;
    if (definition.valueType === "MONEY_CENTS") {
      const cents = sourceValues.map((value) => value.valueCents ?? ZERO_CENTS);
      const total = cents.reduce((sum, value) => sum + value, ZERO_CENTS);
      const valueCents = definition.aggregation === "AVG"
        ? total / BigInt(cents.length)
        : definition.aggregation === "LAST"
          ? cents[cents.length - 1] ?? ZERO_CENTS
          : total;
      aggregated.push({ metricDefinitionId: definition.id, valueCents, valueDecimal: null });
      continue;
    }
    const values = sourceValues.map((value) => toDecimal(value));
    const total = values.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
    const valueDecimal = definition.aggregation === "AVG"
      ? total.dividedBy(values.length)
      : definition.aggregation === "LAST"
        ? values[values.length - 1] ?? new Prisma.Decimal(0)
        : total;
    aggregated.push({ metricDefinitionId: definition.id, valueCents: null, valueDecimal });
  }
  return calculateMetrics({ definitions, values: aggregated });
}

export function hasRequiredDirectMetrics({ definitions, inputs }: { definitions: MetricDefinitionInput[]; inputs: NormalizedMetricInput[] }) {
  const inputIds = new Set(inputs.map((input) => input.metricDefinitionId));
  return definitions
    .filter((definition) => definition.isActive !== false && definition.calculation === "DIRECT" && definition.inputRequired)
    .every((definition) => inputIds.has(definition.id));
}
