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
  codAmountCents: 2999,
  currency: "EUR",
  customerWhatsapp: "+351900000000",
  note: "demo",
  customFields: { provider: { sku: "PT-DEMO-01" } },
  items: [{ productName: "Demo Product", quantity: 2 }],
};

describe("logistics export batch helpers", () => {
  it("reads configured custom order fields without adding a new code branch", () => {
    expect(exportFieldValue(order, "custom:provider.sku")).toBe("PT-DEMO-01");
    expect(exportFieldValue(order, "codAmount")).toBe("29.99");
    expect(exportFieldValue(order, "constant:PP")).toBe("PP");
  });

  it("uses a stable object hash for a batch row snapshot", () => {
    expect(logisticsBatchHash({ b: 2, a: { y: 1, x: 0 } })).toBe(logisticsBatchHash({ a: { x: 0, y: 1 }, b: 2 }));
  });

  it("only assigns a batch department when every selected order shares one", () => {
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-sales" }])).toBe("dept-sales");
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-shipping" }])).toBeNull();
  });
});
