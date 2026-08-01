import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  aggregateMetricSets,
  calculateMetrics,
  normalizeMetricInput,
  parseMoneyToCents,
  type MetricDefinitionInput,
} from "../marketing-metrics";

const definitions: Array<MetricDefinitionInput & { aggregation: "SUM" | "AVG" | "LAST" }> = [
  { id: "spend", code: "SPEND", name: "花费", valueType: "MONEY_CENTS", calculation: "DIRECT", numeratorMetricCode: null, denominatorMetricCode: null, multiplier: null, inputRequired: true, showOnWorkbench: true, sortOrder: 10, isActive: true, aggregation: "SUM" },
  { id: "revenue", code: "REVENUE", name: "收入", valueType: "MONEY_CENTS", calculation: "DIRECT", numeratorMetricCode: null, denominatorMetricCode: null, multiplier: null, inputRequired: true, showOnWorkbench: true, sortOrder: 20, isActive: true, aggregation: "SUM" },
  { id: "conversions", code: "CONVERSIONS", name: "转化", valueType: "COUNT", calculation: "DIRECT", numeratorMetricCode: null, denominatorMetricCode: null, multiplier: null, inputRequired: true, showOnWorkbench: true, sortOrder: 30, isActive: true, aggregation: "SUM" },
  { id: "roas", code: "ROAS", name: "ROAS", valueType: "DECIMAL", calculation: "RATIO", numeratorMetricCode: "REVENUE", denominatorMetricCode: "SPEND", multiplier: new Prisma.Decimal(1), inputRequired: false, showOnWorkbench: true, sortOrder: 40, isActive: true, aggregation: "SUM" },
  { id: "cpa", code: "CPA", name: "单次转化成本", valueType: "MONEY_CENTS", calculation: "RATIO", numeratorMetricCode: "SPEND", denominatorMetricCode: "CONVERSIONS", multiplier: new Prisma.Decimal(1), inputRequired: false, showOnWorkbench: true, sortOrder: 50, isActive: true, aggregation: "SUM" },
];

describe("marketing metric calculations", () => {
  it("stores submitted money exactly as cents and never accepts a derived field as user input", () => {
    expect(parseMoneyToCents("299.90")).toBe(BigInt("29990"));
    expect(parseMoneyToCents("299.999")).toBeNull();
    expect(normalizeMetricInput({ definition: definitions[0], value: "299.90" })).toEqual({ metricDefinitionId: "spend", valueCents: BigInt("29990"), valueDecimal: null });
    expect(normalizeMetricInput({ definition: definitions[3], value: "3.5" })).toBeNull();
  });

  it("calculates a money-per-conversion ratio in cents, without a 100x display error", () => {
    const values = [
      { metricDefinitionId: "spend", valueCents: BigInt("12500"), valueDecimal: null },
      { metricDefinitionId: "revenue", valueCents: BigInt("42000"), valueDecimal: null },
      { metricDefinitionId: "conversions", valueCents: null, valueDecimal: new Prisma.Decimal(14) },
    ];
    const metrics = calculateMetrics({ definitions, values });
    expect(metrics.find((metric) => metric.code === "ROAS")?.valueDecimal).toBe("3.36");
    // 125.00 / 14 = 8.92857, stored as 893 cents for display as 8.93.
    expect(metrics.find((metric) => metric.code === "CPA")?.valueCents).toBe("893");
  });

  it("aggregates raw facts before calculating a team ratio", () => {
    const metrics = aggregateMetricSets({
      definitions,
      valueSets: [
        [
          { metricDefinitionId: "spend", valueCents: BigInt("10000"), valueDecimal: null },
          { metricDefinitionId: "revenue", valueCents: BigInt("30000"), valueDecimal: null },
          { metricDefinitionId: "conversions", valueCents: null, valueDecimal: new Prisma.Decimal(10) },
        ],
        [
          { metricDefinitionId: "spend", valueCents: BigInt("2500"), valueDecimal: null },
          { metricDefinitionId: "revenue", valueCents: BigInt("12000"), valueDecimal: null },
          { metricDefinitionId: "conversions", valueCents: null, valueDecimal: new Prisma.Decimal(4) },
        ],
      ],
    });
    expect(metrics.find((metric) => metric.code === "ROAS")?.valueDecimal).toBe("3.36");
    expect(metrics.find((metric) => metric.code === "CPA")?.valueCents).toBe("893");
  });
});
