import { describe, expect, it } from "vitest";

import { validateUpload } from "@/lib/storage/file-validation";

function tinyDocxPackage(options: { compressedSize?: number; uncompressedSize?: number } = {}) {
  const names = ["[Content_Types].xml", "word/document.xml"];
  const localEntries: Buffer[] = [];
  const localOffsets: number[] = [];
  let localLength = 0;
  for (const name of names) {
    const fileName = Buffer.from(name, "utf8");
    const entry = Buffer.alloc(30 + fileName.length);
    entry.writeUInt32LE(0x04034b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(fileName.length, 26);
    fileName.copy(entry, 30);
    localOffsets.push(localLength);
    localLength += entry.length;
    localEntries.push(entry);
  }
  const centralEntries = names.map((name, index) => {
    const fileName = Buffer.from(name, "utf8");
    const entry = Buffer.alloc(46 + fileName.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(options.compressedSize ?? 0, 20);
    entry.writeUInt32LE(options.uncompressedSize ?? 0, 24);
    entry.writeUInt16LE(fileName.length, 28);
    entry.writeUInt32LE(localOffsets[index], 42);
    fileName.copy(entry, 46);
    return entry;
  });
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localLength, 16);
  return new Uint8Array(Buffer.concat([...localEntries, centralDirectory, end]));
}

describe("Word 文档上传校验", () => {
  it("accepts a DOCX only when its OOXML entries are present", () => {
    const result = validateUpload({
      originalName: "员工手册.docx",
      declaredMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: tinyDocxPackage(),
    });
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.storageKey).toMatch(/^[a-f0-9-]{36}\.docx$/);
  });

  it("rejects a generic ZIP renamed as a DOCX", () => {
    const genericZip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]);
    expect(() => validateUpload({
      originalName: "archive.docx",
      declaredMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: genericZip,
    })).toThrow("FILE_SIGNATURE_MISMATCH");
  });

  it("rejects a DOCX package with an unsafe compression ratio before preview extraction", () => {
    expect(() => validateUpload({
      originalName: "unsafe.docx",
      declaredMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: tinyDocxPackage({ compressedSize: 1, uncompressedSize: 51 * 1024 * 1024 }),
    })).toThrow("FILE_SIGNATURE_MISMATCH");
  });
});
