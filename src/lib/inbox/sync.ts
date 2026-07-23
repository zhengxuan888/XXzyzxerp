import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChannelProviderAdapter } from "@/lib/inbox/provider";
import { messageIdempotencyKey } from "@/lib/inbox/provider";

export async function syncChannelConnection(connectionId: string, adapter: ChannelProviderAdapter) {
  const connection = await prisma.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const cursor = await prisma.syncCursor.findUnique({
    where: { channelConnectionId_cursorKey: { channelConnectionId: connection.id, cursorKey: "messages" } },
  });
  const batch = await adapter.pull(cursor?.cursorValue);
  let inserted = 0;

  for (const incoming of batch.messages) {
    const attemptKey = messageIdempotencyKey(connection.id, incoming);
    const existingAttempt = await prisma.deliveryAttempt.findUnique({
      where: { channelConnectionId_idempotencyKey: { channelConnectionId: connection.id, idempotencyKey: attemptKey } },
    });
    if (existingAttempt?.status === "SUCCEEDED") continue;

    const attempt = await prisma.deliveryAttempt.upsert({
      where: { channelConnectionId_idempotencyKey: { channelConnectionId: connection.id, idempotencyKey: attemptKey } },
      update: { status: "PROCESSING", attemptCount: { increment: 1 }, lastErrorCode: null, lastErrorMessage: null },
      create: {
        channelConnectionId: connection.id,
        operation: "PULL_MESSAGE",
        idempotencyKey: attemptKey,
        status: "PROCESSING",
        attemptCount: 1,
      },
    });

    try {
      await prisma.$transaction(async (tx) => {
        const identity = await tx.contactIdentity.upsert({
          where: {
            channelConnectionId_providerContactKey: {
              channelConnectionId: connection.id,
              providerContactKey: incoming.providerContactKey,
            },
          },
          update: { displayName: incoming.contactDisplayName },
          create: {
            businessUnitId: connection.businessUnitId,
            channelConnectionId: connection.id,
            providerContactKey: incoming.providerContactKey,
            displayName: incoming.contactDisplayName,
          },
        });
        const conversation = await tx.conversation.upsert({
          where: {
            channelConnectionId_providerThreadKey: {
              channelConnectionId: connection.id,
              providerThreadKey: incoming.providerThreadKey,
            },
          },
          update: {
            preview: incoming.text,
            lastMessageAt: incoming.occurredAt,
            unreadCount: { increment: 1 },
          },
          create: {
            legalEntityId: connection.legalEntityId,
            businessUnitId: connection.businessUnitId,
            departmentId: connection.departmentId,
            channelConnectionId: connection.id,
            contactIdentityId: identity.id,
            providerThreadKey: incoming.providerThreadKey,
            subject: incoming.subject,
            preview: incoming.text,
            unreadCount: 1,
            lastMessageAt: incoming.occurredAt,
          },
        });
        const message = await tx.message.upsert({
          where: {
            conversationId_providerMessageKey: {
              conversationId: conversation.id,
              providerMessageKey: incoming.providerMessageKey,
            },
          },
          update: {},
          create: {
            conversationId: conversation.id,
            providerMessageKey: incoming.providerMessageKey,
            direction: "INBOUND",
            senderIdentity: incoming.providerContactKey,
            contentText: incoming.text,
            occurredAt: incoming.occurredAt,
          },
        });
        await tx.deliveryAttempt.update({ where: { id: attempt.id }, data: { messageId: message.id, status: "SUCCEEDED" } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      inserted += 1;
    } catch (error) {
      await prisma.deliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "RETRYABLE",
          nextRetryAt: new Date(Date.now() + 60_000),
          lastErrorCode: "SYNC_FAILED",
          lastErrorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown sync failure",
        },
      });
      throw error;
    }
  }

  await prisma.syncCursor.upsert({
    where: { channelConnectionId_cursorKey: { channelConnectionId: connection.id, cursorKey: "messages" } },
    update: { cursorValue: batch.nextCursor, lastSuccessAt: new Date(), lastErrorAt: null, lastErrorCode: null },
    create: {
      channelConnectionId: connection.id,
      cursorKey: "messages",
      cursorValue: batch.nextCursor,
      lastSuccessAt: new Date(),
    },
  });
  await prisma.channelConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
  return { inserted, nextCursor: batch.nextCursor };
}
