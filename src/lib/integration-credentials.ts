import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const INTEGRATION_PROVIDERS = ["SHIP24", "FEISHU", "GOOGLE_TRANSLATE", "GOOGLE_VISION", "GOOGLE_ADDRESS_VALIDATION"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type Ship24Credential = {
  apiKey: string;
  baseUrl: string;
  webhookSecret?: string;
};

export type FeishuCredential = {
  botWebhookUrl?: string;
  botSecret?: string;
  verificationToken?: string;
};

export type GoogleTranslateCredential = { apiKey: string };
export type GoogleVisionCredential = { apiKey: string };
export type GoogleAddressValidationCredential = { apiKey: string };

type CredentialPayload = Ship24Credential | FeishuCredential | GoogleTranslateCredential | GoogleVisionCredential | GoogleAddressValidationCredential;

function encryptionKey() {
  const secret = process.env.INTEGRATION_CREDENTIAL_MASTER_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("接口凭据加密主密钥未配置或长度不足 32 个字符。");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptCredential(payload: CredentialPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredential<T extends CredentialPayload>(value: string): T {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("接口凭据密文格式无效。");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export async function getStoredCredential<T extends CredentialPayload>(businessUnitId: string, providerKey: IntegrationProvider) {
  const record = await prisma.integrationCredential.findUnique({
    where: { businessUnitId_providerKey: { businessUnitId, providerKey } },
  });
  if (!record?.isEnabled) return null;
  return decryptCredential<T>(record.encryptedPayload);
}

export function secretHint(value?: string) {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

export async function getShip24Credential(businessUnitId: string): Promise<Ship24Credential | null> {
  const stored = await getStoredCredential<Ship24Credential>(businessUnitId, "SHIP24");
  if (stored) return stored;
  const apiKey = process.env.SHIP24_API_KEY?.trim();
  if (process.env.SHIP24_ENABLED !== "true" || !apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.SHIP24_API_BASE_URL?.trim() || "https://api.ship24.com",
    webhookSecret: process.env.SHIP24_WEBHOOK_SECRET?.trim() || undefined,
  };
}

export async function getFeishuCredential(businessUnitId: string): Promise<FeishuCredential | null> {
  const stored = await getStoredCredential<FeishuCredential>(businessUnitId, "FEISHU");
  if (stored) return stored;
  const botWebhookUrl = process.env.FEISHU_BOT_WEBHOOK_URL?.trim();
  const botSecret = process.env.FEISHU_BOT_SECRET?.trim();
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN?.trim();
  return botWebhookUrl || verificationToken ? { botWebhookUrl, botSecret, verificationToken } : null;
}

export async function getGoogleTranslateCredential(businessUnitId: string): Promise<GoogleTranslateCredential | null> {
  const stored = await getStoredCredential<GoogleTranslateCredential>(businessUnitId, "GOOGLE_TRANSLATE");
  if (stored) return stored;
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  return apiKey ? { apiKey } : null;
}

export async function getGoogleVisionCredential(businessUnitId: string): Promise<GoogleVisionCredential | null> {
  const stored = await getStoredCredential<GoogleVisionCredential>(businessUnitId, "GOOGLE_VISION");
  if (stored) return stored;
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (apiKey) return { apiKey };
  // 同一 Google Cloud 项目启用多个 API 时可复用已加密保存的翻译密钥。
  return getGoogleTranslateCredential(businessUnitId);
}

export async function getGoogleAddressValidationCredential(businessUnitId: string): Promise<GoogleAddressValidationCredential | null> {
  const stored = await getStoredCredential<GoogleAddressValidationCredential>(businessUnitId, "GOOGLE_ADDRESS_VALIDATION");
  if (stored) return stored;
  const apiKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY?.trim();
  if (apiKey) return { apiKey };
  // 同一 Google Cloud 项目启用多个 API 时可复用已加密保存的 Vision 密钥，避免管理员重复录入。
  return getGoogleVisionCredential(businessUnitId);
}
