import { describe, expect, it } from "vitest";
import { issueSessionToken, parseSessionFromToken } from "@/lib/auth";

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
});
