import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const types = {
  "image/png": { extension: "png", maxBytes: 5 * 1024 * 1024 },
  "image/jpeg": { extension: "jpg", maxBytes: 5 * 1024 * 1024 },
  "image/webp": { extension: "webp", maxBytes: 5 * 1024 * 1024 },
  "application/pdf": { extension: "pdf", maxBytes: 10 * 1024 * 1024 },
} as const;

export type AllowedMimeType = keyof typeof types;

function detectedMime(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function validateUpload(input: { originalName: string; declaredMime: string; bytes: Uint8Array }) {
  if (!input.originalName || input.originalName.includes("\0")) throw new Error("INVALID_FILE_NAME");
  const declared = input.declaredMime.toLowerCase() as AllowedMimeType;
  if (!(declared in types)) throw new Error("UNSUPPORTED_MIME_TYPE");
  const actual = detectedMime(input.bytes);
  if (!actual || actual !== declared) throw new Error("FILE_SIGNATURE_MISMATCH");
  const rule = types[actual];
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > rule.maxBytes) throw new Error("FILE_SIZE_LIMIT_EXCEEDED");
  const suppliedExtension = path.extname(input.originalName).toLowerCase().replace(/^\./, "");
  const allowedExtensions = actual === "image/jpeg" ? ["jpg", "jpeg"] : [rule.extension];
  if (!allowedExtensions.includes(suppliedExtension)) throw new Error("FILE_EXTENSION_MISMATCH");
  return {
    mimeType: actual,
    extension: rule.extension,
    storageKey: `${randomUUID()}.${rule.extension}`,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    sizeBytes: input.bytes.byteLength,
    originalName: path.basename(input.originalName).slice(0, 180),
  };
}
