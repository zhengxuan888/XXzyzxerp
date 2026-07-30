import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/storage/file-validation";
import { LocalDemoStorageAdapter } from "@/lib/storage/local-demo";

const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("附件安全校验", () => {
  it("接受声明、扩展名和文件签名一致的 PNG", () => {
    const result = validateUpload({ originalName: "商品图.png", declaredMime: "image/png", bytes: pngHeader });
    expect(result.mimeType).toBe("image/png");
    expect(result.storageKey).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("拒绝伪造 MIME、危险扩展名和超限文件", () => {
    expect(() => validateUpload({ originalName: "shell.png", declaredMime: "image/png", bytes: new TextEncoder().encode("MZ executable") })).toThrow("FILE_SIGNATURE_MISMATCH");
    expect(() => validateUpload({ originalName: "photo.exe", declaredMime: "image/png", bytes: pngHeader })).toThrow("FILE_EXTENSION_MISMATCH");
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(pngHeader);
    expect(() => validateUpload({ originalName: "large.png", declaredMime: "image/png", bytes: oversized })).toThrow("FILE_SIZE_LIMIT_EXCEEDED");
  });

  it("允许超过 10MB 但不超过 50MB 的 MP4 凭证", () => {
    const video = new Uint8Array(11 * 1024 * 1024);
    video.set(new TextEncoder().encode("ftyp"), 4);
    const result = validateUpload({ originalName: "出货凭证.mp4", declaredMime: "video/mp4", bytes: video });
    expect(result.mimeType).toBe("video/mp4");
    expect(result.sizeBytes).toBe(video.byteLength);
  });

  it("本地存储拒绝路径穿越和非随机存储键", async () => {
    const storage = new LocalDemoStorageAdapter();
    await expect(storage.get("../secret.png")).rejects.toThrow("INVALID_STORAGE_KEY");
    await expect(storage.put({ storageKey: "script.exe", bytes: pngHeader })).rejects.toThrow("INVALID_STORAGE_KEY");
  });
});
