import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "@/lib/storage/adapter";

const STORAGE_KEY_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|webp|pdf|xlsx)$/;

export class LocalDemoStorageAdapter implements StorageAdapter {
  readonly providerKey = "LOCAL_DEMO";
  private readonly root = path.resolve(process.cwd(), ".local-storage");

  private resolveKey(storageKey: string) {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("INVALID_STORAGE_KEY");
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("PATH_TRAVERSAL_BLOCKED");
    return resolved;
  }

  async put(input: { storageKey: string; bytes: Uint8Array }) {
    const target = this.resolveKey(input.storageKey);
    await mkdir(this.root, { recursive: true });
    await writeFile(target, input.bytes, { flag: "wx", mode: 0o600 });
    return { storageKey: input.storageKey, sizeBytes: input.bytes.byteLength };
  }

  async get(storageKey: string) {
    try {
      return new Uint8Array(await readFile(this.resolveKey(storageKey)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(storageKey: string) {
    await rm(this.resolveKey(storageKey), { force: true });
  }

  async exists(storageKey: string) {
    try {
      await access(this.resolveKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export const localDemoStorage = new LocalDemoStorageAdapter();
