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
  recipientDistrict: "Baixa",
  recipientStreet: "Rua Augusta",
  recipientHouseNumber: "88, 2º D",
  recipientAddress: "Demo Street 1",
  recipientFullAddress: "Demo Street 1, Lisbon, 1000-001, Portugal",
  codAmountCents: 2999,
  currency: "EUR",
  productValueCents: 2600,
  declarationCurrency: "EUR",
  customerWhatsapp: "+351900000000",
  note: "demo",
  customFields: {
    provider: { sku: "PT-DEMO-01" },
    recipientDistrict: "Legacy district",
    streetNumber: "Legacy street",
    doorNumber: "Legacy house number",
    declaredAmount: "999.99",
    declaredCurrency: "PLN",
  },
  items: [{ productName: "iPhone 16 Pro Max 黑色 256GB", quantity: 3, unitPriceCents: 867 }],
};

describe("logistics export batch helpers", () => {
  it("reads configured custom order fields without adding a new code branch", () => {
    expect(exportFieldValue(order, "custom:provider.sku")).toBe("PT-DEMO-01");
    expect(exportFieldValue(order, "codAmount")).toBe("29.99");
    expect(exportFieldValue(order, "constant:PP")).toBe("PP");
    expect(exportFieldValue(order, "recipientFullAddress")).toBe("Demo Street 1, Lisbon, 1000-001, Portugal");
    expect(exportFieldValue(order, "recipientDistrict")).toBe("Baixa");
    expect(exportFieldValue(order, "recipientStreet")).toBe("Rua Augusta");
    expect(exportFieldValue(order, "recipientHouseNumber")).toBe("88, 2º D");
    expect(exportFieldValue(order, "constant:Phone")).toBe("Phone");
    expect(exportFieldValue(order, "constant:手机")).toBe("手机");
    expect(exportFieldValue(order, "constant:HYBH-SJ-X")).toBe("HYBH-SJ-X");
    expect(exportFieldValue(order, "productConfigurations")).toBe("iPhone 16 Pro Max 黑色 256GB");
    expect(exportFieldValue(order, "declaredAmount")).toBe(26);
    expect(exportFieldValue(order, "unitPrice")).toBe("8.67");
  });

  it("keeps provider custom columns intact while preferring unambiguous structured fields", () => {
    expect(exportFieldValue(order, "custom:recipientDistrict")).toBe("Baixa");
    expect(exportFieldValue(order, "custom:streetNumber")).toBe("Legacy street");
    expect(exportFieldValue(order, "custom:doorNumber")).toBe("88, 2º D");

    const legacy = {
      ...order,
      recipientDistrict: null,
      recipientStreet: null,
      recipientHouseNumber: null,
      customFields: { recipientDistrict: "Centro", street: "Avenida 5", streetNumber: "Legacy number", doorNumber: "12" },
    };
    expect(exportFieldValue(legacy, "recipientDistrict")).toBe("Centro");
    expect(exportFieldValue(legacy, "recipientStreet")).toBe("Avenida 5");
    expect(exportFieldValue(legacy, "recipientHouseNumber")).toBe("12");
    expect(exportFieldValue(legacy, "custom:streetNumber")).toBe("Legacy number");
  });

  it("conservatively resolves missing structured fields from a legacy complete address", () => {
    const legacy = {
      ...order,
      recipientRegion: "Comunidad de Madrid",
      recipientDistrict: null,
      recipientStreet: null,
      recipientHouseNumber: null,
      recipientCountryCode: "ES",
      recipientFullAddress: "María García, Calle de Alcalá 123, 4º B, 28009 Madrid, España",
      customFields: {},
    };
    expect(exportFieldValue(legacy, "recipientStreet")).toBe("Calle de Alcalá");
    expect(exportFieldValue(legacy, "recipientHouseNumber")).toBe("123, 4º B");
  });

  it("uses a stable object hash for a batch row snapshot", () => {
    expect(logisticsBatchHash({ b: 2, a: { y: 1, x: 0 } })).toBe(logisticsBatchHash({ a: { x: 0, y: 1 }, b: 2 }));
  });

  it("only assigns a batch department when every selected order shares one", () => {
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-sales" }])).toBe("dept-sales");
    expect(commonDepartmentId([{ departmentId: "dept-sales" }, { departmentId: "dept-shipping" }])).toBeNull();
  });
});
