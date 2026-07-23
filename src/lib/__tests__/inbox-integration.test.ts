import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncChannelConnection } from "@/lib/inbox/sync";
import type { ChannelProviderAdapter } from "@/lib/inbox/provider";

const externalRef = `acceptance-${Date.now()}`;
let connectionId = "";

const duplicateAdapter: ChannelProviderAdapter = {
  key: "ACCEPTANCE_DEMO",
  async pull() {
    return {
      nextCursor: "fixed-cursor",
      messages: [{
        providerMessageKey: "fixed-message",
        providerThreadKey: "fixed-thread",
        providerContactKey: "fixed-contact",
        contactDisplayName: "幂等测试联系人",
        subject: "重复消息测试",
        text: "同一条消息不应重复入库",
        occurredAt: new Date("2026-07-24T00:00:00.000Z"),
      }],
    };
  },
};

describe.sequential("统一收件箱 PostgreSQL 幂等与重试状态", () => {
  beforeAll(async () => {
    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { isActive: true },
      include: { legalEntity: true, departments: { where: { isActive: true }, take: 1 } },
    });
    const connection = await prisma.channelConnection.create({
      data: {
        legalEntityId: businessUnit.legalEntityId,
        businessUnitId: businessUnit.id,
        departmentId: businessUnit.departments[0]?.id ?? null,
        providerKey: "ACCEPTANCE_DEMO",
        displayName: "验收临时渠道",
        externalRef,
        configuration: { localTest: true },
      },
    });
    connectionId = connection.id;
  });

  afterAll(async () => {
    if (connectionId) await prisma.channelConnection.delete({ where: { id: connectionId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("重复拉取同一 providerMessageKey 只写入一条消息", async () => {
    await expect(syncChannelConnection(connectionId, duplicateAdapter)).resolves.toEqual({ inserted: 1, nextCursor: "fixed-cursor" });
    await expect(syncChannelConnection(connectionId, duplicateAdapter)).resolves.toEqual({ inserted: 0, nextCursor: "fixed-cursor" });

    const conversations = await prisma.conversation.findMany({
      where: { channelConnectionId: connectionId },
      include: { messages: true },
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0].messages).toHaveLength(1);
    const attempts = await prisma.deliveryAttempt.findMany({ where: { channelConnectionId: connectionId } });
    const messageAttempts = attempts.filter((attempt) => attempt.operation === "PULL_MESSAGE");
    expect(messageAttempts).toHaveLength(1);
    expect(messageAttempts[0].status).toBe("SUCCEEDED");
    expect(messageAttempts[0].attemptCount).toBe(1);
  });

  it("Provider 拉取失败进入 RETRYABLE 并记录同步错误", async () => {
    await prisma.syncCursor.update({
      where: { channelConnectionId_cursorKey: { channelConnectionId: connectionId, cursorKey: "messages" } },
      data: { cursorValue: "failure-case" },
    });
    const failingAdapter: ChannelProviderAdapter = {
      key: "ACCEPTANCE_DEMO",
      async pull() {
        throw new Error("simulated provider timeout");
      },
    };
    await expect(syncChannelConnection(connectionId, failingAdapter)).rejects.toThrow("simulated provider timeout");
    const attempt = await prisma.deliveryAttempt.findUniqueOrThrow({
      where: {
        channelConnectionId_idempotencyKey: {
          channelConnectionId: connectionId,
          idempotencyKey: "pull:failure-case",
        },
      },
    });
    expect(attempt.status).toBe("RETRYABLE");
    expect(attempt.nextRetryAt).toBeInstanceOf(Date);
    expect(attempt.lastErrorCode).toBe("PROVIDER_PULL_FAILED");
    const cursor = await prisma.syncCursor.findUniqueOrThrow({
      where: { channelConnectionId_cursorKey: { channelConnectionId: connectionId, cursorKey: "messages" } },
    });
    expect(cursor.lastErrorCode).toBe("PROVIDER_PULL_FAILED");
  });
});
