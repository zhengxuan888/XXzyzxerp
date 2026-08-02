import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptCredential, encryptCredential, secretHint } from "@/lib/integration-credentials";

describe("integration credential encryption", () => {
  const previousKey = process.env.INTEGRATION_CREDENTIAL_MASTER_KEY;

  beforeEach(() => {
    process.env.INTEGRATION_CREDENTIAL_MASTER_KEY = "test-only-master-key-with-at-least-thirty-two-characters";
  });

  afterEach(() => {
    process.env.INTEGRATION_CREDENTIAL_MASTER_KEY = previousKey;
  });

  it("encrypts and authenticates credential payloads", () => {
    const encrypted = encryptCredential({ apiKey: "ship24-secret-key", baseUrl: "https://api.ship24.com" });
    expect(encrypted).not.toContain("ship24-secret-key");
    expect(decryptCredential(encrypted)).toEqual({ apiKey: "ship24-secret-key", baseUrl: "https://api.ship24.com" });
  });

  it("rejects ciphertext when the master key changes", () => {
    const encrypted = encryptCredential({ botWebhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/demo" });
    process.env.INTEGRATION_CREDENTIAL_MASTER_KEY = "another-test-master-key-with-at-least-thirty-two-characters";
    expect(() => decryptCredential(encrypted)).toThrow();
  });

  it("only exposes the last four characters as a UI hint", () => {
    expect(secretHint("very-private-token-1234")).toBe("••••1234");
    expect(secretHint()).toBeNull();
  });
});
