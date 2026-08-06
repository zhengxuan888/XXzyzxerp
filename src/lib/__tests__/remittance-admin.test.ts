import { describe, expect, it } from "vitest";

import { isRemittanceAdministrator } from "@/lib/finance/remittance-admin";

describe("remittance administrator access", () => {
  it("allows only platform and legacy system administrators", () => {
    expect(isRemittanceAdministrator("platform_admin")).toBe(true);
    expect(isRemittanceAdministrator("legacy_admin")).toBe(true);
  });

  it.each(["business_manager", "legacy_ceo", "director", "employee", "legacy_aftersales", null])("rejects non-admin role %s", (role) => {
    expect(isRemittanceAdministrator(role)).toBe(false);
  });
});
