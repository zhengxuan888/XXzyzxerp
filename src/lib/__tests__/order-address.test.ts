import { describe, expect, it } from "vitest";

import {
  CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
  hasCustomerOriginalAddress,
  LEGACY_DERIVED_ADDRESS_SOURCE,
  preserveOriginalAddress,
} from "@/lib/order-address";

describe("preserveOriginalAddress", () => {
  it("never overwrites an existing customer address snapshot", () => {
    expect(preserveOriginalAddress(
      "María García\nCalle de Alcalá 123, 4º B\n28009 Madrid, España",
      "a changed value",
    )).toBe("María García\nCalle de Alcalá 123, 4º B\n28009 Madrid, España");
  });

  it("captures only a genuine original-address value and never fabricates one from split fields", () => {
    expect(preserveOriginalAddress(null, "  Rua Augusta 88, 1100-053 Lisboa  "))
      .toBe("Rua Augusta 88, 1100-053 Lisboa");
    expect(preserveOriginalAddress(null, "")).toBeNull();
  });

  it("trusts only explicit customer-original provenance", () => {
    expect(hasCustomerOriginalAddress(CUSTOMER_ORIGINAL_ADDRESS_SOURCE)).toBe(true);
    expect(hasCustomerOriginalAddress(LEGACY_DERIVED_ADDRESS_SOURCE)).toBe(false);
    expect(hasCustomerOriginalAddress(null)).toBe(false);
  });
});
