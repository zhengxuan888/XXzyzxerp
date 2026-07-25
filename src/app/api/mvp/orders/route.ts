import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { resolveOrderReadScope, withOrderReadScope } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { normalizeMoneyCents } from "@/lib/money";
import { parseOrderTemplateConfiguration, sanitizeOrderCustomValues } from "@/lib/order-template";

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
  const orderReadScope = await resolveOrderReadScope(auth.membership, auth.userId);
  if (orderReadScope === "NONE") {
    return NextResponse.json({ error: "FORBIDDEN", reasons: ["NO_READ_SCOPE_FOR_ORDERS"] }, { status: 403 });
  }

  const pagination = parsePagination(request);
  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const baseWhere: Prisma.OrderWhereInput = {
    businessUnitId: auth.membership.businessUnitId,
    ...(status ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            { orderNo: { contains: query, mode: "insensitive" } },
            { recipientName: { contains: query, mode: "insensitive" } },
            { recipientPhone: { contains: query } },
          ],
        }
      : {}),
  };
  const where = withOrderReadScope(baseWhere as Record<string, unknown>, orderReadScope, auth.membership, auth.userId) as Prisma.OrderWhereInput;
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

  const orderTemplate = typeof body.orderTemplateId === "string"
    ? await prisma.orderTemplate.findFirst({
        where: { id: body.orderTemplateId, businessUnitId: auth.membership.businessUnitId, isActive: true },
      })
    : await prisma.orderTemplate.findFirst({
        where: { businessUnitId: auth.membership.businessUnitId, isActive: true, isDefault: true },
      });
  if (typeof body.orderTemplateId === "string" && !orderTemplate) {
    return fail("INVALID_ORDER_TEMPLATE", "订单模板不属于当前业务板块或已停用。", 400);
  }
  const templateConfiguration = parseOrderTemplateConfiguration(orderTemplate?.configuration);
  if (templateConfiguration.requireSku && items.some((item) => !item.skuId)) {
    return fail("SKU_REQUIRED", "当前订单模板要求必须选择 SKU。", 400);
  }
  const recipientPhone = typeof body.recipientPhone === "string" ? body.recipientPhone.trim() : "";
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().toLowerCase() : "";
  const recipientAddress = typeof body.recipientAddress === "string" ? body.recipientAddress.trim() : "";
  const recipientCountryCode = typeof body.recipientCountryCode === "string" ? body.recipientCountryCode.trim() : "";
  const recipientPostalCode = typeof body.recipientPostalCode === "string" ? body.recipientPostalCode.trim() : "";
  const recipientRegion = typeof body.recipientRegion === "string" ? body.recipientRegion.trim() : "";
  const recipientCity = typeof body.recipientCity === "string" ? body.recipientCity.trim() : "";
  if (templateConfiguration.requireRecipientPhone && !recipientPhone) {
    return fail("RECIPIENT_PHONE_REQUIRED", "当前订单模板要求填写收件人电话。", 400);
  }
  if (templateConfiguration.requireRecipientEmail && !recipientEmail) {
    return fail("RECIPIENT_EMAIL_REQUIRED", "当前订单模板要求填写客户邮箱。", 400);
  }
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return fail("RECIPIENT_EMAIL_INVALID", "客户邮箱格式不正确。", 400);
  }
  if (templateConfiguration.requireRecipientAddress && !recipientAddress) {
    return fail("RECIPIENT_ADDRESS_REQUIRED", "当前订单模板要求填写详细地址。", 400);
  }
  if (templateConfiguration.requireRecipientCountryCode && !recipientCountryCode) {
    return fail("RECIPIENT_COUNTRY_CODE_REQUIRED", "当前订单模板要求填写收件人国家代码。", 400);
  }
  if (templateConfiguration.requireRecipientPostalCode && !recipientPostalCode) {
    return fail("RECIPIENT_POSTAL_CODE_REQUIRED", "当前订单模板要求填写邮政编码。", 400);
  }
  if (templateConfiguration.requireRecipientRegion && !recipientRegion) {
    return fail("RECIPIENT_REGION_REQUIRED", "当前订单模板要求填写地区/州。", 400);
  }
  if (templateConfiguration.requireRecipientCity && !recipientCity) {
    return fail("RECIPIENT_CITY_REQUIRED", "当前订单模板要求填写城市。", 400);
  }
  const customFields = sanitizeOrderCustomValues(body.customFields, templateConfiguration.customFields);
  if (customFields.missing.length > 0) {
    return fail("CUSTOM_FIELDS_REQUIRED", `请填写：${customFields.missing.join("、")}`, 400);
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
    codAmount = body.codAmountCents == null ? templateConfiguration.defaultCodAmountCents : normalizeMoneyCents(body.codAmountCents);
    shippingFee = body.shippingFeeCents == null ? templateConfiguration.defaultShippingFeeCents : normalizeMoneyCents(body.shippingFeeCents);
  } catch {
    return fail("INVALID_MONEY_CENTS", "Money fields must be non-negative safe integers in minor currency units.", 400);
  }
  if (templateConfiguration.requireCodAmount && codAmount <= 0) {
    return fail("COD_AMOUNT_REQUIRED", "当前订单模板要求 COD 金额必须大于 0。", 400);
  }
  const orderedAt = typeof body.orderedAt === "string" ? new Date(body.orderedAt) : new Date();
  if (Number.isNaN(orderedAt.getTime())) return fail("INVALID_ORDER_DATE", "订单日期格式不正确。", 400);
  const packageWeightGrams = Number(body.packageWeightGrams ?? 0);
  if (!Number.isSafeInteger(packageWeightGrams) || packageWeightGrams < 0) {
    return fail("INVALID_PACKAGE_WEIGHT", "包裹重量格式不正确。", 400);
  }
  if (templateConfiguration.requirePackageWeight && packageWeightGrams <= 0) {
    return fail("PACKAGE_WEIGHT_REQUIRED", "当前订单模板要求填写包裹重量。", 400);
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
        orderTemplateId: orderTemplate?.id,
        status: "DRAFT",
        currency: typeof body.currency === "string" ? body.currency.trim().toUpperCase().slice(0, 3) : templateConfiguration.currency,
        productValueCents: productValue,
        shippingFeeCents: shippingFee,
        codAmountCents: codAmount,
        paidAmountCents: 0,
        logisticsChannel: typeof body.logisticsChannel === "string" ? body.logisticsChannel.trim().slice(0, 50) : templateConfiguration.logisticsChannel,
        recipientName: typeof body.recipientName === "string" ? body.recipientName.trim().slice(0, 100) : null,
        recipientPhone: recipientPhone || null,
        recipientEmail: recipientEmail || null,
        emailValidationStatus: typeof body.emailValidationStatus === "string"
          ? body.emailValidationStatus.trim().toUpperCase().slice(0, 30)
          : null,
        emailValidatedAt: body.emailValidationStatus === "likely_valid" ? new Date() : null,
        recipientCountryCode: recipientCountryCode ? recipientCountryCode.toUpperCase().slice(0, 3) : null,
        recipientPostalCode: recipientPostalCode ? recipientPostalCode.slice(0, 30) : null,
        recipientRegion: recipientRegion ? recipientRegion.slice(0, 100) : null,
        recipientCity: recipientCity ? recipientCity.slice(0, 100) : null,
        recipientAddress: recipientAddress || null,
        packageWeightGrams,
        paymentMethod: typeof body.paymentMethod === "string" ? body.paymentMethod.trim().slice(0, 30) : templateConfiguration.paymentMethod,
        customerWhatsapp: typeof body.customerWhatsapp === "string" ? body.customerWhatsapp.trim().slice(0, 50) : null,
        staffWhatsapp: typeof body.staffWhatsapp === "string" ? body.staffWhatsapp.trim().slice(0, 50) : null,
        orderedAt,
        note: typeof body.note === "string" ? body.note : null,
        exceptionNote: typeof body.exceptionNote === "string" ? body.exceptionNote : null,
        customFields: customFields.values as Prisma.InputJsonValue,
        templateSnapshot: orderTemplate ? {
          templateId: orderTemplate.id,
          code: orderTemplate.code,
          name: orderTemplate.name,
          configuration: templateConfiguration,
          capturedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue : undefined,
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
  if (body.status !== undefined) {
    return fail(
      "WORKFLOW_ACTION_REQUIRED",
      "订单状态不能通过通用更新接口修改，请使用提交、核单、发货或物流事件专用动作。",
      400,
    );
  }

  const target = await prisma.order.findUnique({ where: { id: body.id } });
  if (!target) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const canUpdate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.update",
    targetBusinessUnitId: target.businessUnitId,
  });
  if (!canUpdate.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canUpdate.reasons }, { status: 403 });
  }

  const data: {
    note?: string;
    exceptionNote?: string;
  } = {};
  if (typeof body.note === "string") data.note = body.note;
  if (typeof body.exceptionNote === "string") data.exceptionNote = body.exceptionNote;

  const row = await prisma.order.update({ where: { id: target.id }, data });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: "order.update",
    targetType: "order",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { changed: { note: data.note, exceptionNote: data.exceptionNote } },
  });

  return ok(row);
}
