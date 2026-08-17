import { describe, expect, it } from "vitest";

import { classifyOrderContactHistory } from "@/lib/order-contact-history";

const row = (overrides: Partial<Parameters<typeof classifyOrderContactHistory>[0]> = {}) => ({
  id: "current",
  recipientEmail: null,
  recipientPhone: "+34 612 345 678",
  customerWhatsapp: null,
  recipientCountryCode: "ES",
  createdAt: new Date("2026-08-18T03:00:00.000Z"),
  ...overrides,
});

describe("order contact history classification", () => {
  it("keeps a same-day duplicate visible after the other order was reviewed", () => {
    const current = row();
    const reviewed = row({ id: "reviewed", createdAt: new Date("2026-08-18T01:00:00.000Z") });
    expect(classifyOrderContactHistory(current, [reviewed, current])).toMatchObject({ duplicate: true, repeat: false });
  });

  it("detects repeat purchases against older historical orders", () => {
    const current = row({ recipientEmail: "new@example.com" });
    const historical = row({ id: "old", recipientEmail: "old@example.com", recipientPhone: "34612345678", createdAt: new Date("2026-07-01T03:00:00.000Z") });
    expect(classifyOrderContactHistory(current, [historical])).toMatchObject({ duplicate: false, repeat: true, matchedOrderCount: 1 });
  });

  it("matches any shared contact instead of only the first populated field", () => {
    const current = row({ recipientEmail: "one@example.com", customerWhatsapp: "+34 699 000 111" });
    const historical = row({ id: "old", recipientEmail: "other@example.com", recipientPhone: null, customerWhatsapp: "34699000111", createdAt: new Date("2026-08-10T03:00:00.000Z") });
    expect(classifyOrderContactHistory(current, [historical]).repeat).toBe(true);
  });
});
