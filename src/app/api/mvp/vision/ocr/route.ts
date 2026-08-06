import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { getGoogleVisionCredential } from "@/lib/integration-credentials";
import { checkPermission } from "@/lib/permission";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "登录已失效，请重新登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "当前账号没有录单权限。", 403);

  const body = await request.json().catch(() => null) as { imageBase64?: string; mimeType?: string } | null;
  const imageBase64 = body?.imageBase64?.trim() ?? "";
  const mimeType = body?.mimeType?.trim().toLowerCase() ?? "";
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) return fail("VISION_IMAGE_TYPE_INVALID", "仅支持 JPG、PNG 或 WebP 图片。", 400);
  if (!imageBase64 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) return fail("VISION_IMAGE_INVALID", "图片内容无效。", 400);
  if (Math.ceil(imageBase64.length * 0.75) > MAX_IMAGE_BYTES) return fail("VISION_IMAGE_TOO_LARGE", "图片不能超过 5MB。", 413);

  const credential = await getGoogleVisionCredential(auth.membership.businessUnitId);
  if (!credential?.apiKey) return fail("GOOGLE_VISION_NOT_CONFIGURED", "Google 图片识别尚未配置，请联系管理员。", 503);

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(credential.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: imageBase64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }] }] }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!response) return fail("GOOGLE_VISION_UNAVAILABLE", "图片识别服务暂时无法连接，请稍后重试。", 502);
  const payload = await response.json().catch(() => null) as { responses?: Array<{ fullTextAnnotation?: { text?: string }; textAnnotations?: Array<{ description?: string }>; error?: { message?: string } }> } | null;
  const result = payload?.responses?.[0];
  if (!response.ok || result?.error) return fail("GOOGLE_VISION_FAILED", result?.error?.message || "图片识别失败，请检查接口配置。", 502);
  const text = result?.fullTextAnnotation?.text?.trim() || result?.textAnnotations?.[0]?.description?.trim() || "";
  if (!text) return fail("VISION_TEXT_NOT_FOUND", "没有从图片中识别到文字，请换一张更清晰的截图。", 422);
  return ok({ text, provider: "GOOGLE_VISION" });
}
