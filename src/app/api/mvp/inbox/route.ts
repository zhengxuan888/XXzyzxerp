import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { inboxScopeWhere, canAssignToDepartment } from "@/lib/inbox/scope";
import { DemoInboxAdapter } from "@/lib/inbox/demo-adapter";
import { syncChannelConnection } from "@/lib/inbox/sync";
import { parsePagination } from "@/lib/api-response";

async function authorize(request: NextRequest, actionKey: string) {
  const auth = await requireAuthContext(request);
  if (!auth) return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
  });
  if (!decision.allowed) {
    return { response: NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 }) };
  }
  return { auth, decision };
}

export async function GET(request: NextRequest) {
  const access = await authorize(request, "inbox.read");
  if ("response" in access) return access.response;
  const where = inboxScopeWhere({
    businessUnitId: access.auth.membership.businessUnitId,
    departmentId: access.auth.membership.departmentId,
    permissionReasons: access.decision.reasons,
  });
  const pagination = parsePagination(request, 100);
  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const scopedWhere = { ...where, ...(status ? { status: status as never } : {}) };
  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where: scopedWhere,
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        channelConnection: { select: { providerKey: true, displayName: true } },
        contactIdentity: { select: { displayName: true, normalizedAddress: true } },
        messages: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 100 },
        assignments: {
          where: { isActive: true },
          include: { assignee: { include: { user: { select: { fullName: true } } } } },
        },
        tags: { include: { tag: true } },
        customerLinks: { include: { customer: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.conversation.count({ where: scopedWhere }),
  ]);
  const [memberships, tags, customers, connections] = await Promise.all([
    prisma.membership.findMany({
      where: {
        businessUnitId: access.auth.membership.businessUnitId,
        isActive: true,
        ...(access.decision.reasons.includes("SCOPE_DEPARTMENT_OK")
          ? { departmentId: access.auth.membership.departmentId }
          : {}),
      },
      include: { user: { select: { fullName: true } }, department: { select: { name: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.inboxTag.findMany({ where: { businessUnitId: access.auth.membership.businessUnitId, isActive: true } }),
    prisma.customer.findMany({ where: { businessUnitId: access.auth.membership.businessUnitId, isActive: true } }),
    prisma.channelConnection.findMany({ where: { ...where, isActive: true } }),
  ]);
  return NextResponse.json({
    ok: true,
    data: {
      conversations,
      memberships,
      tags,
      customers,
      connections,
      meta: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        pageCount: Math.ceil(total / pagination.pageSize),
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const actionKey =
    body.action === "sync_demo"
      ? "inbox.sync.demo"
      : body.action === "assign"
        ? "inbox.assign"
        : body.action === "link_customer"
          ? "inbox.customer.link"
          : "inbox.manage";
  const access = await authorize(request, actionKey);
  if ("response" in access) return access.response;
  const scopeWhere = inboxScopeWhere({
    businessUnitId: access.auth.membership.businessUnitId,
    departmentId: access.auth.membership.departmentId,
    permissionReasons: access.decision.reasons,
  });

  if (body.action === "sync_demo") {
    const connection = await prisma.channelConnection.findFirst({
      where: { id: String(body.connectionId ?? ""), providerKey: "DEMO", ...scopeWhere, isActive: true },
    });
    if (!connection) return NextResponse.json({ error: "DEMO_CONNECTION_NOT_FOUND" }, { status: 404 });
    const result = await syncChannelConnection(connection.id, new DemoInboxAdapter());
    await prisma.inboxAuditEvent.create({
      data: {
        legalEntityId: access.auth.membership.legalEntityId,
        businessUnitId: access.auth.membership.businessUnitId,
        actorUserId: access.auth.userId,
        actorMembershipId: access.auth.membership.id,
        eventType: "DEMO_SYNC",
        details: result,
      },
    });
    return NextResponse.json({ ok: true, data: result });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: String(body.conversationId ?? ""), ...scopeWhere },
  });
  if (!conversation) return NextResponse.json({ error: "CONVERSATION_NOT_FOUND" }, { status: 404 });

  if (body.action === "status") {
    const allowed = new Set(["OPEN", "PENDING", "RESOLVED", "CLOSED"]);
    const status = String(body.status ?? "");
    if (!allowed.has(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: status as never } });
  } else if (body.action === "assign") {
    const target = await prisma.membership.findFirst({
      where: {
        id: String(body.membershipId ?? ""),
        businessUnitId: conversation.businessUnitId,
        isActive: true,
      },
    });
    if (
      !target ||
      !canAssignToDepartment(access.auth.membership.departmentId, target.departmentId, access.decision.reasons) ||
      (conversation.departmentId && target.departmentId !== conversation.departmentId)
    ) {
      return NextResponse.json({ error: "ASSIGNEE_OUT_OF_SCOPE" }, { status: 403 });
    }
    await prisma.$transaction([
      prisma.conversationAssignment.updateMany({
        where: { conversationId: conversation.id, isActive: true },
        data: { isActive: false, endedAt: new Date() },
      }),
      prisma.conversationAssignment.create({
        data: {
          conversationId: conversation.id,
          assigneeMembershipId: target.id,
          assignedByMembershipId: access.auth.membership.id,
        },
      }),
    ]);
  } else if (body.action === "tag") {
    const tag = await prisma.inboxTag.findFirst({
      where: { id: String(body.tagId ?? ""), businessUnitId: conversation.businessUnitId, isActive: true },
    });
    if (!tag) return NextResponse.json({ error: "TAG_NOT_FOUND" }, { status: 404 });
    await prisma.conversationTag.upsert({
      where: { conversationId_tagId: { conversationId: conversation.id, tagId: tag.id } },
      update: {},
      create: { conversationId: conversation.id, tagId: tag.id },
    });
  } else if (body.action === "link_customer") {
    const customer = await prisma.customer.findFirst({
      where: { id: String(body.customerId ?? ""), businessUnitId: conversation.businessUnitId, isActive: true },
    });
    if (!customer) return NextResponse.json({ error: "CUSTOMER_NOT_FOUND" }, { status: 404 });
    await prisma.conversationCustomerLink.upsert({
      where: { conversationId_customerId: { conversationId: conversation.id, customerId: customer.id } },
      update: { linkType: String(body.linkType ?? "CUSTOMER").slice(0, 32) },
      create: { conversationId: conversation.id, customerId: customer.id, linkType: String(body.linkType ?? "CUSTOMER").slice(0, 32) },
    });
  } else {
    return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  await prisma.inboxAuditEvent.create({
    data: {
      legalEntityId: access.auth.membership.legalEntityId,
      businessUnitId: access.auth.membership.businessUnitId,
      conversationId: conversation.id,
      actorUserId: access.auth.userId,
      actorMembershipId: access.auth.membership.id,
      eventType: `CONVERSATION_${String(body.action).toUpperCase()}`,
      details: body as Prisma.InputJsonObject,
    },
  });
  return NextResponse.json({ ok: true });
}
