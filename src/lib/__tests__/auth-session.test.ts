import { describe, expect, it, vi } from "vitest";
import { isSecureSessionCookie, issueSessionToken, parseSessionFromToken } from "@/lib/auth";

describe("登录与 Session 编码一致性", () => {
  it("中文用户名只作为 JWT 数据，不依赖 URL 或 Header 编码", async () => {
    const payload = {
      userId: "user-uuid-001",
      username: "张三_销售",
      activeMembershipId: "membership-uuid-001",
    };
    const token = await issueSessionToken(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(parseSessionFromToken(token)).resolves.toEqual(payload);
  });

  it("篡改或损坏的 Session 不能通过验签", async () => {
    const token = await issueSessionToken({
      userId: "user-uuid-001",
      username: "员工 A",
      activeMembershipId: "membership-uuid-001",
    });
    await expect(parseSessionFromToken(`${token.slice(0, -2)}xx`)).resolves.toBeNull();
    await expect(parseSessionFromToken("not-a-jwt")).resolves.toBeNull();
  });

  it("按公开访问协议设置 Session Cookie 的 Secure 属性", () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_BASE_URL", "http://43.134.91.39");
      expect(isSecureSessionCookie()).toBe(false);
      vi.stubEnv("APP_BASE_URL", "https://erp.example.com");
      expect(isSecureSessionCookie()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
