import { createHash } from "node:crypto";

import { getGoogleTranslateCredential } from "@/lib/integration-credentials";
import { prisma } from "@/lib/prisma";
import { translateTrackingDescription } from "@/lib/tracking-translation";

const hasCjk = (value: string) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
export const trackingTextHash = (value: string) => createHash("sha256").update(value.trim(), "utf8").digest("hex");

export async function translateAndCacheTrackingText(
  businessUnitId: string,
  rawValue: string | null | undefined,
  options: { forceGoogle?: boolean } = {},
) {
  const sourceText = rawValue?.trim();
  if (!sourceText || hasCjk(sourceText)) return sourceText ?? null;
  const verified = translateTrackingDescription(sourceText);
  const sourceHash = trackingTextHash(sourceText);
  const cached = await prisma.trackingTranslation.findUnique({ where: { businessUnitId_sourceHash: { businessUnitId, sourceHash } } });
  // Human-reviewed wording is authoritative and must never be replaced by an
  // automatic provider, including during a full Google retranslation run.
  if (cached?.provider === "MANUAL_VERIFIED") {
    await prisma.trackingTranslation.update({ where: { id: cached.id }, data: { useCount: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
    return cached.translatedText;
  }
  if (cached && !options.forceGoogle) {
    await prisma.trackingTranslation.update({ where: { id: cached.id }, data: { useCount: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
    return cached.translatedText;
  }
  if (verified && !options.forceGoogle) {
    await prisma.trackingTranslation.create({ data: { businessUnitId, sourceHash, sourceText, translatedText: verified, provider: "VERIFIED_DICTIONARY" } });
    return verified;
  }
  const credential = await getGoogleTranslateCredential(businessUnitId);
  if (!credential) return null;
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(credential.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: sourceText, target: "zh-CN", format: "text" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GOOGLE_TRANSLATE_${response.status}`);
  const payload = await response.json() as { data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> } };
  const item = payload.data?.translations?.[0];
  const translatedText = item?.translatedText?.trim();
  if (!translatedText) return null;
  await prisma.trackingTranslation.upsert({
    where: { businessUnitId_sourceHash: { businessUnitId, sourceHash } },
    create: { businessUnitId, sourceHash, sourceText, translatedText, sourceLanguage: item?.detectedSourceLanguage, provider: "GOOGLE_TRANSLATE" },
    update: { translatedText, sourceLanguage: item?.detectedSourceLanguage, lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
  return translatedText;
}

export async function loadTrackingTranslations(businessUnitId: string, values: Array<string | null>) {
  const sources = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value) && !hasCjk(value!)))];
  const hashes = sources.map(trackingTextHash);
  const rows = hashes.length ? await prisma.trackingTranslation.findMany({ where: { businessUnitId, sourceHash: { in: hashes } } }) : [];
  return new Map(rows.map((row) => [row.sourceHash, row.translatedText]));
}
