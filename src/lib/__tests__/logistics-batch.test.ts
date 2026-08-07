import { describe, expect, it } from "vitest";

import { commonDepartmentId, exportFieldValue, logisticsBatchHash } from "@/lib/logistics-batch";

const order = {
  orderNo: "ZY20260731-1",
  recipientName: "Alice",
  recipientPhone: "+351900000000",
  recipientEmail: "alice@example.test",
  recipientCountryCode: "PT",
  recipientPostalCode: "1000-001",
  recipientRegion: "Lisbon",
  recipientCity: "Lisbon",
  recipientAddress: "Demo Street 1",
  recipientFullAddress: "Demo Street 1, Lisbon, 1000-001, Portugal",
  codAmountCents: 2999,
  currency: "EUR",
  customerWhatsapp: "+351900000000",
  note: "demo",
  customFields: { provider: { sku: "PT-DEMO-01" } },
  items: [{ productName: "iPhone 16 Pro Max 黑色 256GB", quantity: 2 }],
};

describe("logistics export batch helpers", () => {
  it("reads configured custom order fields without adding a new code branch", () => {
    expect(exportFieldValue(order, "custom:provider.sku")).toBe("PT-DEMO-01");
    expect(exportFieldValue(order, "codAmount")).toBe("29.99");
    expect(exportFieldValue(order, "constant:PP")).toBe("PP");
    expect(exportFieldValue(order, "recipientFullAddress")).toBe("Demo Street 1, Lisbon, 1000-001, Portugal");
    expect(exportFieldValue(order, "constant:Phone")).toBe("Phone");
    expect(exportFieldValue(order, "constant:手机")).toBe("手机");
    expect(exportFieldValue(order, "constant:HYBH-SJ-X")).toBe("HYBH-SJ-X");
    expect(exportFieldValue(order, "productConfigurations")).toBe("iPhone 16 Pro Max 黑色 256GB");
  });

  it("uses a stable object hash for a batch row snapshot", () => {
    expect(logisticsBatchHash({ b: 2, a: { y: 1, x: 0 } })).toBe(logisticsBatchHash({ a: { x: 0, y: 1 }, b: 2 }));
  });

  it("only assigns a batch department when every selected order shares one", () => {
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-sales" }])).toBe("dept-sales");
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-shipping" }])).toBeNull();
  });
});
