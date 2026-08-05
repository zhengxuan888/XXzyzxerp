import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  decryptCredential,
  encryptCredential,
  secretHint,
  type FeishuCredential,
  type GoogleTranslateCredential,
  type Ship24Credential,
} from "@/lib/integration-credentials";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

async function authorize(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return { response: fail("UNAUTHENTICATED", "请先登录。", 401) };
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "shipment.workbench.configure",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return { response: fail("FORBIDDEN", "没有管理第三方接口的权限。", 403) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await authorize(request);
  if ("response" in result) return result.response;
  const rows = await prisma.integrationCredential.findMany({
    where: { businessUnitId: result.auth.membership.businessUnitId, providerKey: { in: ["SHIP24", "FEISHU", "GOOGLE_TRANSLATE"] } },
  });
  const ship24Row = rows.find((row) => row.providerKey === "SHIP24");
  const feishuRow = rows.find((row) => row.providerKey === "FEISHU");
  const googleRow = rows.find((row) => row.providerKey === "GOOGLE_TRANSLATE");
  try {
    const ship24 = ship24Row ? decryptCredential<Ship24Credential>(ship24Row.encryptedPayload) : null;
    const feishu = feishuRow ? decryptCredential<FeishuCredential>(feishuRow.encryptedPayload) : null;
    const googleTranslate = googleRow ? decryptCredential<GoogleTranslateCredential>(googleRow.encryptedPayload) : null;
    return ok({
      ship24: {
        enabled: ship24Row?.isEnabled ?? false,
        configured: Boolean(ship24?.apiKey),
        apiKeyHint: secretHint(ship24?.apiKey),
        baseUrl: ship24?.baseUrl ?? "https://api.ship24.com",
        webhookSecretConfigured: Boolean(ship24?.webhookSecret),
        webhookSecretHint: secretHint(ship24?.webhookSecret),
        updatedAt: ship24Row?.updatedAt.toISOString() ?? null,
      },
      feishu: {
        enabled: feishuRow?.isEnabled ?? false,
        configured: Boolean(feishu?.botWebhookUrl || feishu?.verificationToken),
        botWebhookUrlConfigured: Boolean(feishu?.botWebhookUrl),
        botWebhookUrlHint: secretHint(feishu?.botWebhookUrl),
        botSecretConfigured: Boolean(feishu?.botSecret),
        botSecretHint: secretHint(feishu?.botSecret),
        verificationTokenConfigured: Boolean(feishu?.verificationToken),
        verificationTokenHint: secretHint(feishu?.verificationToken),
        updatedAt: feishuRow?.updatedAt.toISOString() ?? null,
      },
      googleTranslate: {
        enabled: googleRow?.isEnabled ?? false,
        configured: Boolean(googleTranslate?.apiKey),
        apiKeyHint: secretHint(googleTranslate?.apiKey),
        updatedAt: googleRow?.updatedAt.toISOString() ?? null,
      },
    });
  } catch {
    return fail("CREDENTIAL_DECRYPTION_FAILED", "接口凭据无法解密，请检查服务器加密主密钥。", 503);
  }
}

type UpdateBody = {
  ship24?: { enabled?: boolean; apiKey?: string; baseUrl?: string; webhookSecret?: string; clearWebhookSecret?: boolean };
  feishu?: { enabled?: boolean; botWebhookUrl?: string; botSecret?: string; verificationToken?: string; clearBotSecret?: boolean; clearVerificationToken?: boolean };
  googleTranslate?: { enabled?: boolean; apiKey?: string };
};

export async function PUT(request: NextRequest) {
  const result = await authorize(request);
  if ("response" in result) return result.response;
  const body = await request.json().catch(() => null) as UpdateBody | null;
  if (!body || (!body.ship24 && !body.feishu && !body.googleTranslate)) return fail("INVALID_BODY", "请提交需要更新的接口配置。", 400);
  const businessUnitId = result.auth.membership.businessUnitId;
  const existing = await prisma.integrationCredential.findMany({ where: { businessUnitId } });
  const changedProviders: string[] = [];
  const changedFields: Record<string, string[]> = {};

  try {
    await prisma.$transaction(async (tx) => {
      if (body.ship24) {
        const oldRow = existing.find((row) => row.providerKey === "SHIP24");
        const old = oldRow ? decryptCredential<Ship24Credential>(oldRow.encryptedPayload) : null;
        const apiKey = body.ship24.apiKey?.trim() || old?.apiKey || "";
        const baseUrl = body.ship24.baseUrl?.trim() || old?.baseUrl || "https://api.ship24.com";
        let parsedUrl: URL;
        try { parsedUrl = new URL(baseUrl); } catch { return Promise.reject(new Error("SHIP24_BASE_URL_INVALID")); }
        if (parsedUrl.protocol !== "https:") return Promise.reject(new Error("SHIP24_BASE_URL_INVALID"));
        if (body.ship24.enabled && !apiKey) return Promise.reject(new Error("SHIP24_API_KEY_REQUIRED"));
        const webhookSecret = body.ship24.clearWebhookSecret ? undefined : body.ship24.webhookSecret?.trim() || old?.webhookSecret;
        const payload: Ship24Credential = { apiKey, baseUrl, webhookSecret };
        await tx.integrationCredential.upsert({
          where: { businessUnitId_providerKey: { businessUnitId, providerKey: "SHIP24" } },
          create: { businessUnitId, providerKey: "SHIP24", encryptedPayload: encryptCredential(payload), isEnabled: body.ship24.enabled === true, updatedByUserId: result.auth.userId },
          update: { encryptedPayload: encryptCredential(payload), isEnabled: body.ship24.enabled ?? oldRow?.isEnabled ?? false, updatedByUserId: result.auth.userId },
        });
        changedProviders.push("SHIP24");
        changedFields.SHIP24 = [body.ship24.apiKey ? "apiKey" : null, body.ship24.baseUrl ? "baseUrl" : null, body.ship24.webhookSecret || body.ship24.clearWebhookSecret ? "webhookSecret" : null, body.ship24.enabled !== undefined ? "enabled" : null].filter((value): value is string => Boolean(value));
      }
      if (body.feishu) {
        const oldRow = existing.find((row) => row.providerKey === "FEISHU");
        const old = oldRow ? decryptCredential<FeishuCredential>(oldRow.encryptedPayload) : null;
        const botWebhookUrl = body.feishu.botWebhookUrl?.trim() || old?.botWebhookUrl;
        if (botWebhookUrl) {
          const url = new URL(botWebhookUrl);
          if (url.protocol !== "https:" || !["open.feishu.cn", "open.larksuite.com"].includes(url.hostname) || !url.pathname.startsWith("/open-apis/bot/v2/hook/")) {
            return Promise.reject(new Error("FEISHU_WEBHOOK_URL_INVALID"));
          }
        }
        const payload: FeishuCredential = {
          botWebhookUrl,
          botSecret: body.feishu.clearBotSecret ? undefined : body.feishu.botSecret?.trim() || old?.botSecret,
          verificationToken: body.feishu.clearVerificationToken ? undefined : body.feishu.verificationToken?.trim() || old?.verificationToken,
        };
        if (body.feishu.enabled && !payload.botWebhookUrl && !payload.verificationToken) return Promise.reject(new Error("FEISHU_CREDENTIAL_REQUIRED"));
        await tx.integrationCredential.upsert({
          where: { businessUnitId_providerKey: { businessUnitId, providerKey: "FEISHU" } },
          create: { businessUnitId, providerKey: "FEISHU", encryptedPayload: encryptCredential(payload), isEnabled: body.feishu.enabled === true, updatedByUserId: result.auth.userId },
          update: { encryptedPayload: encryptCredential(payload), isEnabled: body.feishu.enabled ?? oldRow?.isEnabled ?? false, updatedByUserId: result.auth.userId },
        });
        changedProviders.push("FEISHU");
        changedFields.FEISHU = [body.feishu.botWebhookUrl ? "botWebhookUrl" : null, body.feishu.botSecret || body.feishu.clearBotSecret ? "botSecret" : null, body.feishu.verificationToken || body.feishu.clearVerificationToken ? "verificationToken" : null, body.feishu.enabled !== undefined ? "enabled" : null].filter((value): value is string => Boolean(value));
      }
      if (body.googleTranslate) {
        const oldRow = existing.find((row) => row.providerKey === "GOOGLE_TRANSLATE");
        const old = oldRow ? decryptCredential<GoogleTranslateCredential>(oldRow.encryptedPayload) : null;
        const apiKey = body.googleTranslate.apiKey?.trim() || old?.apiKey || "";
        if (body.googleTranslate.enabled && !apiKey) return Promise.reject(new Error("GOOGLE_TRANSLATE_API_KEY_REQUIRED"));
        await tx.integrationCredential.upsert({
          where: { businessUnitId_providerKey: { businessUnitId, providerKey: "GOOGLE_TRANSLATE" } },
          create: { businessUnitId, providerKey: "GOOGLE_TRANSLATE", encryptedPayload: encryptCredential({ apiKey }), isEnabled: body.googleTranslate.enabled === true, updatedByUserId: result.auth.userId },
          update: { encryptedPayload: encryptCredential({ apiKey }), isEnabled: body.googleTranslate.enabled ?? oldRow?.isEnabled ?? false, updatedByUserId: result.auth.userId },
        });
        changedProviders.push("GOOGLE_TRANSLATE");
        changedFields.GOOGLE_TRANSLATE = [body.googleTranslate.apiKey ? "apiKey" : null, body.googleTranslate.enabled !== undefined ? "enabled" : null].filter((value): value is string => Boolean(value));
      }
      await writeAuditLog({
        actorUserId: result.auth.userId,
        actorMembershipId: result.auth.membership.id,
        module: "system.integration_credentials",
        action: "shipment.workbench.configure",
        targetType: "integration_credentials",
        businessUnitId,
        roleId: result.auth.membership.roleId,
        details: { providers: changedProviders, changedFields },
      }, tx);
    });
    return ok({ updated: changedProviders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CREDENTIAL_UPDATE_FAILED";
    const messages: Record<string, string> = {
      SHIP24_BASE_URL_INVALID: "Ship24 API 地址必须是有效的 HTTPS 地址。",
      SHIP24_API_KEY_REQUIRED: "启用 Ship24 前必须填写 API Key。",
      FEISHU_WEBHOOK_URL_INVALID: "飞书 Webhook 地址格式不正确。",
      FEISHU_CREDENTIAL_REQUIRED: "启用飞书前至少填写机器人 Webhook 或事件验证 Token。",
      GOOGLE_TRANSLATE_API_KEY_REQUIRED: "启用 Google 轨迹翻译前必须填写 API Key。",
    };
    return fail(code, messages[code] ?? "接口配置保存失败。", 400);
  }
}
