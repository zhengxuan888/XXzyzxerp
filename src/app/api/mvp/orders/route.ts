import { NextRequest, NextResponse } from "next/server";

import { OrderStatus } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { finalizeOrderInventory, InventoryError, reserveOrderInventory } from "@/lib/inventory";
import { canTransitionOrder } from "@/lib/order-state";
import { normalizeMoneyCents } from "@/lib/money";

type ParsedOrderItem = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  productName: string;
  skuId: string | null;
};

type SingleItemPayload = {
  customerId?: unknown;
  productId?: unknown;
  productName?: unknown;
  quantity?: unknown;
  unitPriceCents?: unknown;
  skuId?: unknown;
};

function parseItems(raw: unknown): ParsedOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const productId = typeof obj.productId === "string" ? obj.productId : null;
      const quantity = Number(obj.quantity);
      const unitPriceCents = Number(obj.unitPriceCents);
      const productName = typeof obj.productName === "string" ? obj.productName : "";
      if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
      if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null;
      if (productName.trim().length === 0) return null;
      return {
        productId,
        quantity,
        unitPriceCents,
        productName,
        skuId: typeof obj.skuId === "string" ? obj.skuId : null,
      };
    })
    .filter((item: ParsedOrderItem | null): item is ParsedOrderItem => item !== null);
}

function parseSingleItem(body: SingleItemPayload | null): ParsedOrderItem[] {
  if (!body || typeof body !== "object") return [];
  if (typeof body.productId !== "string" || typeof body.customerId !== "string") return [];

  const productId = body.productId.trim();
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const skuId = typeof body.skuId === "string" && body.skuId.trim().length > 0 ? body.skuId.trim() : null;

  const quantity = Number(body.quantity);
  const unitPriceCents = Number(body.unitPriceCents);
  if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
    return [];
  }

  if (!productName) return [];

  return [
    {
      productId,
      productName,
      quantity,
      unitPriceCents,
      skuId,
    },
  ];
}

function statusBodyToUpdateStatus(raw: unknown): OrderStatus | null {
  if (typeof raw === "string") {
    const normalized = raw.trim().toUpperCase();
    if (["DRAFT", "SUBMITTED", "WAITING_SHIPMENT", "SHIPPED", "DELIVERED", "EXCEPTION", "COMPLETED", "CANCELLED"].includes(normalized)) {
      return normalized as OrderStatus;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.read",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canRead.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });
  }

  const canSeeAll = canRead.reasons.includes("SCOPE_ALL") || canRead.reasons.includes("SCOPE_ALL_OK");
  const pagination = parsePagination(request);
  const where = canSeeAll ? {} : { businessUnitId: auth.membership.businessUnitId };
  const [rows, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        creatorUser: { select: { username: true, fullName: true } },
        items: { include: { product: { select: { code: true, name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.order.count({ where }),
  ]);
  return paginated(rows, total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const canWrite = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canWrite.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canWrite.reasons }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.customerId !== "string") {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }

  const items = parseItems(body.items).length > 0 ? parseItems(body.items) : parseSingleItem(body);
  if (items.length === 0) {
    return NextResponse.json({ error: "At least one order item is required." }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: body.customerId, businessUnitId: auth.membership.businessUnitId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer invalid for current business unit." }, { status: 400 });
  }

  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessUnitId: auth.membership.businessUnitId },
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "One or more products do not belong to current business unit." }, { status: 400 });
  }
  const requestedSkuIds = [...new Set(items.flatMap((item) => (item.skuId ? [item.skuId] : [])))];
  if (requestedSkuIds.length > 0) {
    const validSkus = await prisma.productSku.findMany({
      where: {
        id: { in: requestedSkuIds },
        isActive: true,
        product: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      },
      select: { id: true, productId: true },
    });
    const validSkuMap = new Map(validSkus.map((sku) => [sku.id, sku.productId]));
    const invalidSku = items.some((item) => item.skuId && validSkuMap.get(item.skuId) !== item.productId);
    if (validSkus.length !== requestedSkuIds.length || invalidSku) {
      return fail("SKU_OWNERSHIP_MISMATCH", "SKU must belong to the selected product and current business unit.", 400);
    }
  }

  const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, "0");
  const orderNo = `ORD-${Date.now()}-${randomSuffix}`;

  let codAmount = 0;
  let shippingFee = 0;
  try {
    codAmount = body.codAmountCents == null ? 0 : normalizeMoneyCents(body.codAmountCents);
    shippingFee = body.shippingFeeCents == null ? 0 : normalizeMoneyCents(body.shippingFeeCents);
  } catch {
    return fail("INVALID_MONEY_CENTS", "Money fields must be non-negative safe integers in minor currency units.", 400);
  }

  const productValue = items.reduce((sum: number, item: ParsedOrderItem) => sum + item.quantity * item.unitPriceCents, 0);
  if (!Number.isSafeInteger(productValue)) {
    return fail("MONEY_OVERFLOW", "Calculated product value exceeds safe integer range.", 400);
  }

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        departmentId: auth.membership.departmentId,
        siteId: auth.membership.siteId,
        customerId: body.customerId,
        orderNo,
        creatorUserId: auth.userId,
        ownedByMembershipId: auth.membership.id,
        status: "DRAFT",
        currency: typeof body.currency === "string" ? body.currency : "CNY",
        productValueCents: productValue,
        shippingFeeCents: shippingFee,
        codAmountCents: codAmount,
        paidAmountCents: 0,
        note: typeof body.note === "string" ? body.note : null,
        exceptionNote: typeof body.exceptionNote === "string" ? body.exceptionNote : null,
        items: {
          create: items.map((item: ParsedOrderItem) => ({
            productId: item.productId,
            skuId: item.skuId,
            productName: item.productName,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            subtotalCents: item.quantity * item.unitPriceCents,
          })),
        },
      },
      include: { items: true, customer: true },
    });

    return order;
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: "order.create",
    targetType: "order",
    targetId: created.id,
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { orderNo: created.orderNo, customerId: created.customerId },
  });

  return ok(created, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const target = await prisma.order.findUnique({ where: { id: body.id } });
  if (!target) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const canUpdate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: body.status ? "order.status.update" : "order.update",
    targetBusinessUnitId: target.businessUnitId,
  });
  if (!canUpdate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canUpdate.reasons }, { status: 403 });
  }

  const data: {
    note?: string;
    exceptionNote?: string;
    deliveredAt?: Date | null;
    status?: OrderStatus;
  } = {};
  if (typeof body.note === "string") data.note = body.note;
  if (typeof body.exceptionNote === "string") data.exceptionNote = body.exceptionNote;
  if (typeof body.deliveredAt === "string") {
    const deliveredAt = new Date(body.deliveredAt);
    if (Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: "deliveredAt invalid format." }, { status: 400 });
    }
    data.deliveredAt = deliveredAt;
  }

  const nextStatus = typeof body.status === "string" ? statusBodyToUpdateStatus(body.status) : null;
  if (nextStatus) {
    if (!canTransitionOrder(target.status, nextStatus)) {
      return NextResponse.json({ error: `Invalid status transition from ${target.status} to ${nextStatus}.` }, { status: 400 });
    }
    data.status = nextStatus;
  }

  let row;
  try {
    row = await prisma.$transaction(
      async (tx) => {
        const current = await tx.order.findUniqueOrThrow({
          where: { id: target.id },
          include: { items: { select: { skuId: true, quantity: true } } },
        });
        if (current.status !== target.status) {
          throw new Error("ORDER_CONCURRENTLY_CHANGED");
        }
        if (nextStatus === "SUBMITTED") {
          if (!auth.membership.siteId) throw new InventoryError("SITE_REQUIRED", "A site is required to reserve inventory.");
          await reserveOrderInventory(
            tx,
            {
              userId: auth.userId,
              membershipId: auth.membership.id,
              businessUnitId: auth.membership.businessUnitId,
              siteId: auth.membership.siteId,
            },
            current,
          );
        }
        if (nextStatus === "SHIPPED") {
          if (!auth.membership.siteId) throw new InventoryError("SITE_REQUIRED", "A site is required to ship inventory.");
          await finalizeOrderInventory(
            tx,
            {
              userId: auth.userId,
              membershipId: auth.membership.id,
              businessUnitId: auth.membership.businessUnitId,
              siteId: auth.membership.siteId,
            },
            current.id,
            "SHIP",
          );
        }
        if (nextStatus === "CANCELLED" && current.status !== "DRAFT") {
          if (!auth.membership.siteId) throw new InventoryError("SITE_REQUIRED", "A site is required to release inventory.");
          await finalizeOrderInventory(
            tx,
            {
              userId: auth.userId,
              membershipId: auth.membership.id,
              businessUnitId: auth.membership.businessUnitId,
              siteId: auth.membership.siteId,
            },
            current.id,
            "RELEASE",
          );
        }
        return tx.order.update({ where: { id: current.id, status: current.status }, data });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof InventoryError) return fail(error.code, error.message, 409);
    if (error instanceof Error && error.message === "ORDER_CONCURRENTLY_CHANGED") {
      return fail("ORDER_CONCURRENTLY_CHANGED", "Order status changed; refresh before retrying.", 409);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: nextStatus ? "order.status.update" : "order.update",
    targetType: "order",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { changed: { status: nextStatus, note: data.note } },
  });

  return ok(row);
}
