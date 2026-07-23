export type StoredObject = {
  storageKey: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  readonly providerKey: string;
  put(input: { storageKey: string; bytes: Uint8Array }): Promise<StoredObject>;
  get(storageKey: string): Promise<Uint8Array | null>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
