import { beforeEach, describe, expect, it, vi } from "vitest";

const checkPermission = vi.fn();

vi.mock("../permission", () => ({
  checkPermission: (...args: unknown[]) => checkPermission(...args),
}));

import { getSystemConfigurationPermission, SYSTEM_CONFIGURATION_MANAGE_ACTION } from "../system-configuration";

describe("system configuration permission", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires the explicit global configuration action in the active business context", async () => {
    checkPermission.mockResolvedValue({ allowed: true, reasons: ["SCOPE_ALL"] });

    await getSystemConfigurationPermission({
      userId: "u1",
      membership: { id: "m1", businessUnitId: "bu-1", departmentId: "dept-1", siteId: "site-1" },
    });

    expect(checkPermission).toHaveBeenCalledWith({
      userId: "u1",
      membershipId: "m1",
      actionKey: SYSTEM_CONFIGURATION_MANAGE_ACTION,
      allowedScopes: ["ALL"],
      targetBusinessUnitId: "bu-1",
      targetDepartmentId: "dept-1",
      targetSiteId: "site-1",
    });
  });
});
