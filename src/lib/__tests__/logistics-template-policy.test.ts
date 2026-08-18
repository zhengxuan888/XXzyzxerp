import { describe, expect, it } from "vitest";

import {
  HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES,
  HONGYA_FORWARD_TEMPLATE_CODES,
  isHongyaAddressReviewTemplate,
} from "@/lib/logistics-template-policy";

describe("logistics template policy", () => {
  it("classifies only the approved Hongya review templates", () => {
    for (const code of HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES) {
      expect(isHongyaAddressReviewTemplate(code)).toBe(true);
    }
    expect(isHongyaAddressReviewTemplate("FAN_RO_WMS")).toBe(false);
    expect(isHongyaAddressReviewTemplate("")).toBe(false);
  });

  it("keeps every forwarding template in the address-review set without duplicates", () => {
    const reviewCodes = new Set(HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES);
    expect(reviewCodes.size).toBe(HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES.length);
    expect(new Set(HONGYA_FORWARD_TEMPLATE_CODES).size).toBe(HONGYA_FORWARD_TEMPLATE_CODES.length);
    for (const code of HONGYA_FORWARD_TEMPLATE_CODES) expect(reviewCodes.has(code)).toBe(true);
  });
});
