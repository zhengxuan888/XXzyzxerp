import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const LEGACY_XLS_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export type LogisticsSpreadsheetArtifact = {
  originalName: string;
  storageKey: string;
  mimeType: typeof XLSX_MIME_TYPE;
  sizeBytes: number;
  sha256: string;
};

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array) {
  return bytes.byteLength >= prefix.byteLength && prefix.every((value, index) => bytes[index] === value);
}

export function normalizeSpreadsheetName(name: string) {
  const originalName = path.basename(name || "").trim().slice(0, 180);
  if (!originalName || originalName.includes("\0")) throw new Error("INVALID_FILE_NAME");
  return originalName;
}

export function prepareGeneratedSpreadsheetArtifact(originalName: string, bytes: Uint8Array): LogisticsSpreadsheetArtifact {
  const safeName = normalizeSpreadsheetName(originalName);
  if (!safeName.toLowerCase().endsWith(".xlsx")) throw new Error("XLSX_ARTIFACT_NAME_REQUIRED");
  if (!bytes.byteLength || bytes.byteLength > MAX_SPREADSHEET_BYTES) throw new Error("FILE_SIZE_LIMIT_EXCEEDED");
  return {
    originalName: safeName,
    storageKey: `${randomUUID()}.xlsx`,
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function prepareReturnSpreadsheetArtifact(originalName: string, bytes: Uint8Array): LogisticsSpreadsheetArtifact {
  const safeName = normalizeSpreadsheetName(originalName);
  if (!bytes.byteLength || bytes.byteLength > MAX_SPREADSHEET_BYTES) throw new Error("FILE_SIZE_LIMIT_EXCEEDED");
  const extension = path.extname(safeName).toLowerCase();
  if (extension === ".xls" || extension === ".xlt" || hasPrefix(bytes, LEGACY_XLS_SIGNATURE)) {
    // Classic binary Excel needs a separate, sandboxed adapter. Never pretend a
    // CFBF workbook was parsed as modern XLSX or silently drop leading zeros.
    throw new Error("LEGACY_XLS_CONVERSION_REQUIRED");
  }
  if (extension !== ".xlsx" && extension !== ".xltx") throw new Error("XLSX_REQUIRED");
  if (!hasPrefix(bytes, ZIP_SIGNATURE)) throw new Error("FILE_SIGNATURE_MISMATCH");
  return {
    originalName: safeName,
    storageKey: `${randomUUID()}.xlsx`,
    mimeType: XLSX_MIME_TYPE,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
