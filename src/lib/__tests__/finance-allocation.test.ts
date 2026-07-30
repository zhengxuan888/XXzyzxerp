import { describe, expect, it } from "vitest";

import { effectiveAllocationAmount, totalEffectiveAllocationAmount } from "../finance/allocation";

describe("effective finance allocations", () => {
  it("uses the immutable original amount when no reversal exists", () => {
    expect(effectiveAllocationAmount({ id: "allocation-1", amountCents: BigInt(1299), effects: [] })).toBe(BigInt(1299));
  });

  it("subtracts an append-only reversal rather than mutating the original allocation", () => {
    const original = { id: "allocation-1", amountCents: BigInt(1299), effects: [{ amountCents: BigInt(1299) }] };
    expect(effectiveAllocationAmount(original)).toBe(BigInt(0));
    expect(totalEffectiveAllocationAmount([
      original,
      { id: "replacement", amountCents: BigInt(1299), effects: [] },
    ])).toBe(BigInt(1299));
  });

  it("rejects an impossible effect total instead of silently making money negative", () => {
    expect(() => effectiveAllocationAmount({
      id: "allocation-1",
      amountCents: BigInt(100),
      effects: [{ amountCents: BigInt(101) }],
    })).toThrow("above");
  });
});
