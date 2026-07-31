import { describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({ prisma: {} }));

import {
  isStoredAttachmentTargetConsistent,
  storedAttachmentPermissionTarget,
} from "../attachments";

describe("stored attachment scope", () => {
  const target = {
    targetType: "PRODUCT" as const,
    targetId: "product-a",
    businessUnitId: "unit-a",
    departmentId: null,
    siteId: null,
    ownerUserId: null,
  };

  it("keeps the persisted department boundary when the canonical target has no department", () => {
    const attachment = {
      businessUnitId: "unit-a",
      departmentId: "department-sales",
      uploadedByUserId: "user-sales",
    };

    expect(isStoredAttachmentTargetConsistent(attachment, target)).toBe(true);
    expect(storedAttachmentPermissionTarget(attachment, target)).toEqual({
      businessUnitId: "unit-a",
      departmentId: "department-sales",
      siteId: null,
      ownerUserId: "user-sales",
    });
  });

  it("rejects a stored attachment whose persisted department conflicts with its canonical target", () => {
    expect(isStoredAttachmentTargetConsistent(
      { businessUnitId: "unit-a", departmentId: "department-sales", uploadedByUserId: "user-sales" },
      { ...target, departmentId: "department-finance" },
    )).toBe(false);
  });

  it("rejects a cross-business-unit stored attachment before permission evaluation", () => {
    expect(isStoredAttachmentTargetConsistent(
      { businessUnitId: "unit-b", departmentId: "department-sales", uploadedByUserId: "user-sales" },
      target,
    )).toBe(false);
  });
});
