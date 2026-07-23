-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYABLE', 'FAILED');

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalRef" TEXT,
    "configuration" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactIdentity" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "providerContactKey" TEXT NOT NULL,
    "displayName" TEXT,
    "normalizedAddress" TEXT,
    "avatarUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "departmentId" TEXT,
    "channelConnectionId" TEXT NOT NULL,
    "contactIdentityId" TEXT NOT NULL,
    "providerThreadKey" TEXT NOT NULL,
    "subject" TEXT,
    "preview" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerMessageKey" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "senderIdentity" TEXT,
    "contentText" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCustomerLink" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationCustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAssignment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "assigneeMembershipId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxTag" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'violet',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTag" (
    "conversationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTag_pkey" PRIMARY KEY ("conversationId","tagId")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "messageId" TEXT,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "cursorKey" TEXT NOT NULL,
    "cursorValue" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxAuditEvent" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "conversationId" TEXT,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "eventType" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelConnection_businessUnitId_departmentId_isActive_idx" ON "ChannelConnection"("businessUnitId", "departmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_businessUnitId_providerKey_externalRef_key" ON "ChannelConnection"("businessUnitId", "providerKey", "externalRef");

-- CreateIndex
CREATE INDEX "ContactIdentity_businessUnitId_normalizedAddress_idx" ON "ContactIdentity"("businessUnitId", "normalizedAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentity_channelConnectionId_providerContactKey_key" ON "ContactIdentity"("channelConnectionId", "providerContactKey");

-- CreateIndex
CREATE INDEX "Conversation_businessUnitId_departmentId_status_lastMessage_idx" ON "Conversation"("businessUnitId", "departmentId", "status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channelConnectionId_providerThreadKey_key" ON "Conversation"("channelConnectionId", "providerThreadKey");

-- CreateIndex
CREATE INDEX "Message_conversationId_occurredAt_idx" ON "Message"("conversationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_providerMessageKey_key" ON "Message"("conversationId", "providerMessageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationCustomerLink_conversationId_customerId_key" ON "ConversationCustomerLink"("conversationId", "customerId");

-- CreateIndex
CREATE INDEX "ConversationAssignment_conversationId_isActive_idx" ON "ConversationAssignment"("conversationId", "isActive");

-- CreateIndex
CREATE INDEX "ConversationAssignment_assigneeMembershipId_isActive_idx" ON "ConversationAssignment"("assigneeMembershipId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InboxTag_businessUnitId_name_key" ON "InboxTag"("businessUnitId", "name");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_status_nextRetryAt_idx" ON "DeliveryAttempt"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_channelConnectionId_idempotencyKey_key" ON "DeliveryAttempt"("channelConnectionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_channelConnectionId_cursorKey_key" ON "SyncCursor"("channelConnectionId", "cursorKey");

-- CreateIndex
CREATE INDEX "InboxAuditEvent_businessUnitId_conversationId_createdAt_idx" ON "InboxAuditEvent"("businessUnitId", "conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactIdentityId_fkey" FOREIGN KEY ("contactIdentityId") REFERENCES "ContactIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCustomerLink" ADD CONSTRAINT "ConversationCustomerLink_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCustomerLink" ADD CONSTRAINT "ConversationCustomerLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_assigneeMembershipId_fkey" FOREIGN KEY ("assigneeMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxTag" ADD CONSTRAINT "InboxTag_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "InboxTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAuditEvent" ADD CONSTRAINT "InboxAuditEvent_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAuditEvent" ADD CONSTRAINT "InboxAuditEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAuditEvent" ADD CONSTRAINT "InboxAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAuditEvent" ADD CONSTRAINT "InboxAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxAuditEvent" ADD CONSTRAINT "InboxAuditEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
