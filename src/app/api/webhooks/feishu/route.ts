import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncChannelConnection } from "@/lib/inbox/sync";
import { FeishuWebhookAdapter, parseFeishuMessage } from "@/lib/inbox/feishu-adapter";

export const runtime = "nodejs";

function sameSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
  const token = typeof payload.token === "string" ? payload.token : request.headers.get("x-feishu-verification-token");
  if (!sameSecret(token, expectedToken)) return NextResponse.json({ error: "INVALID_VERIFICATION_TOKEN" }, { status: 401 });

  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const connectionId = request.headers.get("x-feishu-connection-id");
  if (!connectionId) return NextResponse.json({ error: "MISSING_CONNECTION_ID" }, { status: 400 });
  const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, providerKey: "FEISHU", isActive: true } });
  if (!connection) return NextResponse.json({ error: "FEISHU_CONNECTION_NOT_FOUND" }, { status: 404 });
  const message = parseFeishuMessage(payload);
  if (!message) return NextResponse.json({ ok: true, ignored: true });
  const result = await syncChannelConnection(connection.id, new FeishuWebhookAdapter(message));
  await prisma.inboxAuditEvent.create({
    data: {
      legalEntityId: connection.legalEntityId,
      businessUnitId: connection.businessUnitId,
      eventType: "FEISHU_MESSAGE_RECEIVED",
      details: { providerMessageKey: message.providerMessageKey, inserted: result.inserted },
    },
  });
  return NextResponse.json({ ok: true, data: result });
}
