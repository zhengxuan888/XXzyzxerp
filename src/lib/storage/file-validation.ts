import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const types = {
  "image/png": { extension: "png", maxBytes: 5 * 1024 * 1024 },
  "image/jpeg": { extension: "jpg", maxBytes: 5 * 1024 * 1024 },
  "image/webp": { extension: "webp", maxBytes: 5 * 1024 * 1024 },
  "application/pdf": { extension: "pdf", maxBytes: 10 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx", maxBytes: 10 * 1024 * 1024 },
  "video/mp4": { extension: "mp4", maxBytes: 50 * 1024 * 1024 },
} as const;

const MAX_DOCX_ENTRIES = 1_024;
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 100;

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
  if (isDocxPackage(bytes)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp") return "video/mp4";
  return null;
}

/**
 * DOCX is an OOXML ZIP package. A ZIP signature alone is not sufficient: it
 * would accept arbitrary archives. Inspect central-directory entry names only
 * (without decompressing content) to prove that the package has the two OOXML
 * entries a Word document needs. This avoids a zip-bomb parser in the upload
 * request path while still validating the real file format.
 */
function isDocxPackage(bytes: Uint8Array) {
  if (bytes.length < 22) return false;
  const buffer = Buffer.from(bytes);
  const endSignature = 0x06054b50;
  const directorySignature = 0x02014b50;
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return false;
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  // ZIP64 packages are deliberately rejected in this lightweight request-path
  // validator. Supporting their extended metadata would make it too easy to
  // miss a decompression limit before the DOCX previewer sees the file.
  if (entryCount === 0 || entryCount === 0xffff || entryCount > MAX_DOCX_ENTRIES) return false;
  if (directorySize === 0 || directoryOffset + directorySize > buffer.length) return false;

  const names = new Set<string>();
  const directoryEnd = directoryOffset + directorySize;
  let offset = directoryOffset;
  let entriesSeen = 0;
  let totalUncompressed = 0;
  while (offset + 46 <= directoryEnd && buffer.readUInt32LE(offset) === directorySignature) {
    if (entriesSeen >= entryCount) return false;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > directoryEnd) return false;
    if (uncompressedSize > MAX_DOCX_UNCOMPRESSED_BYTES) return false;
    if (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > MAX_DOCX_COMPRESSION_RATIO) return false;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) return false;
    names.add(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset = entryEnd;
    entriesSeen += 1;
  }
  return offset === directoryEnd && entriesSeen === entryCount && names.has("[Content_Types].xml") && names.has("word/document.xml");
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
