export const HONGYA_FORWARD_TEMPLATE_CODES = [
  "HONGYA_IBERIA_FORWARD",
  "HONGYA_EAST_EU_FORWARD",
  "HONGYA_EAST_FORWARD",
  "（鸿亚）东欧转寄",
] as const;

export const HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES = [
  "HONGYA_IBERIA_DROPSHIP",
  "HONGYA_EAST_EU_DROPSHIP",
  ...HONGYA_FORWARD_TEMPLATE_CODES,
] as const;

export function isHongyaAddressReviewTemplate(code: string) {
  return (HONGYA_ADDRESS_REVIEW_TEMPLATE_CODES as readonly string[]).includes(code);
}
