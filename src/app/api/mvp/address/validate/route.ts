import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import {
  structuredSuggestionFromGoogle,
  type GoogleValidatedAddress,
} from "@/lib/google-address-components";
import { getGoogleAddressValidationCredential } from "@/lib/integration-credentials";
import { checkPermission } from "@/lib/permission";

type Input = {
  countryCode?: string;
  postalCode?: string;
  region?: string;
  city?: string;
  district?: string;
  street?: string;
  houseNumber?: string;
  address?: string;
};
type GoogleResult = {
  result?: {
    verdict?: { addressComplete?: boolean; hasUnconfirmedComponents?: boolean; hasInferredComponents?: boolean; hasReplacedComponents?: boolean };
    address?: GoogleValidatedAddress;
  };
  error?: { message?: string };
};

const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "登录已失效，请重新登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "order.create", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "当前账号没有录单权限。", 403);
  const body = await request.json().catch(() => null) as Input | null;
  const original = {
    countryCode: clean(body?.countryCode, 2).toUpperCase(),
    postalCode: clean(body?.postalCode, 30),
    region: clean(body?.region, 100),
    city: clean(body?.city, 100),
    district: clean(body?.district, 100),
    street: clean(body?.street, 300),
    houseNumber: clean(body?.houseNumber, 120),
    address: clean(body?.address, 500),
  };
  const detailedAddress = original.address || [original.street, original.houseNumber, original.district].filter(Boolean).join(", ");
  if (!/^[A-Z]{2}$/.test(original.countryCode) || !detailedAddress) return fail("ADDRESS_REQUIRED", "请先填写国家和详细地址。", 400);
  const credential = await getGoogleAddressValidationCredential(auth.membership.businessUnitId);
  if (!credential?.apiKey) return fail("GOOGLE_ADDRESS_VALIDATION_NOT_CONFIGURED", "Google 地址验证尚未配置，请联系管理员。", 503);
  const response = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(credential.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ address: { regionCode: original.countryCode, postalCode: original.postalCode, administrativeArea: original.region, locality: original.city, sublocality: original.district, addressLines: [detailedAddress] } }),
  }).catch(() => null);
  if (!response) return fail("GOOGLE_ADDRESS_VALIDATION_UNAVAILABLE", "地址验证服务暂时无法连接。", 502);
  const payload = await response.json().catch(() => null) as GoogleResult | null;
  if (!response.ok || payload?.error) return fail("GOOGLE_ADDRESS_VALIDATION_FAILED", payload?.error?.message || "地址验证失败，请稍后重试。", 502);
  const verdict = payload?.result?.verdict;
  const suggestion = structuredSuggestionFromGoogle(payload?.result?.address, original.countryCode);
  const issues: string[] = [];
  if (!verdict?.addressComplete) issues.push("地址信息可能不完整");
  if (verdict?.hasUnconfirmedComponents) issues.push("部分地址无法确认");
  if (verdict?.hasInferredComponents) issues.push("系统补充了部分地址");
  if (verdict?.hasReplacedComponents) issues.push("系统修正了部分地址");
  const status = verdict?.addressComplete && !verdict?.hasUnconfirmedComponents ? "verified" : "review";
  return ok({ status, label: status === "verified" ? "地址已验证" : "需要人工核对", original, suggestion, issues, provider: "GOOGLE_ADDRESS_VALIDATION" });
}
