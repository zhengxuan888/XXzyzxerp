import { NextRequest, NextResponse } from "next/server";

import { Prisma, type OrderStatus } from "@prisma/client";

import { requireAuthContext } from "@/lib/api-auth";
import { createOrderAccessPlan } from "@/lib/order-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { normalizeMoneyCents } from "@/lib/money";
import { parseOrderItems, parseSingleOrderItem, type ParsedOrderItem } from "@/lib/order-item-input";
import { allocateOrderNumber, OrderNumberingError } from "@/lib/order-numbering";
import { parseOrderTemplateConfiguration, sanitizeOrderCustomValues } from "@/lib/order-template";

const ORDER_STATUSES = new Set<OrderStatus>([
  "DRAFT",
  "SUBMITTED",
  "WAITING_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "EXCEPTION",
  "COMPLETED",
  "CANCELLED",
]);

function parseDateFilter(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const orderReadAccess = await createOrderAccessPlan({ membership: auth.membership, actionKey: "order.read" });
  if (!orderReadAccess.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: ["NO_READ_SCOPE_FOR_ORDERS"] }, { status: 403 });
  }

  const pagination = parsePagination(request);
  const requestedStatus = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();
  const status = requestedStatus && ORDER_STATUSES.has(requestedStatus as OrderStatus)
    ? requestedStatus as OrderStatus
    : undefined;
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  const employee = request.nextUrl.searchParams.get("employee")?.trim();
  const product = request.nextUrl.searchParams.get("product")?.trim().slice(0, 120);
  const country = request.nextUrl.searchParams.get("country")?.trim().toUpperCase().slice(0, 3);
  const start = parseDateFilter(request.nextUrl.searchParams.get("start"));
  const end = parseDateFilter(request.nextUrl.searchParams.get("end"), true);
  const baseWhere: Prisma.OrderWhereInput = {
    businessUnitId: auth.membership.businessUnitId,
    ...(status ? { status } : {}),
    ...(employee ? { creatorUserId: employee } : {}),
    ...(country ? { recipientCountryCode: country } : {}),
    ...(product ? { items: { some: { productName: { contains: product, mode: "insensitive" } } } } : {}),
    ...((start || end) ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    ...(query
      ? {
          OR: [
            { orderNo: { contains: query, mode: "insensitive" } },
            { recipientName: { contains: query, mode: "insensitive" } },
            { recipientEmail: { contains: query, mode: "insensitive" } },
            { recipientPhone: { contains: query } },
            { customerWhatsapp: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.OrderWhereInput = { AND: [orderReadAccess.where, baseWhere] };
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
  if (!body) {
    return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  }

  const parsedItems = parseOrderItems(body.items);
  const items = parsedItems.length > 0 ? parsedItems : parseSingleOrderItem(body);
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
  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  const customerName = typeof body.customerName === "string" ? body.customerName.trim().slice(0, 100) : "";
  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 100) : "";
  if (!customerName) return fail("RECIPIENT_NAME_REQUIRED", "请填写本次订单收件人/客户姓名。", 400);
  if (!shopId) return fail("SHOP_ID_REQUIRED", "请填写比特窗口号（店铺 ID）。", 400);
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

  const customer = customerId ? await prisma.customer.findFirst({
    where: { id: customerId, businessUnitId: auth.membership.businessUnitId },
    select: { id: true },
  }) : await prisma.customer.findFirst({
    where: { businessUnitId: auth.membership.businessUnitId, isActive: true, OR: [
      ...(recipientEmail ? [{ contactEmail: recipientEmail }] : []),
      ...(recipientPhone ? [{ contactPhone: recipientPhone }] : []),
    ] },
    select: { id: true },
  });
  if (customerId && !customer) return NextResponse.json({ error: "Customer invalid for current business unit." }, { status: 400 });

  const productIds = [...new Set(items.flatMap((item) => item.productId ? [item.productId] : []))];
  if (productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, businessUnitId: auth.membership.businessUnitId },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "One or more products do not belong to current business unit." }, { status: 400 });
    }
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
    const invalidSku = items.some((item) => item.skuId && (!validSkuMap.has(item.skuId) || (item.productId && validSkuMap.get(item.skuId) !== item.productId)));
    if (validSkus.length !== requestedSkuIds.length || invalidSku) {
      return fail("SKU_OWNERSHIP_MISMATCH", "SKU must belong to the selected product and current business unit.", 400);
    }
    for (const item of items) {
      if (item.skuId) item.productId = validSkuMap.get(item.skuId) ?? null;
    }
  }

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

  try {
    const created = await prisma.$transaction(async (tx) => {
      const allocatedOrderNumber = await allocateOrderNumber(tx, {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        departmentId: auth.membership.departmentId,
        orderTemplateId: orderTemplate?.id ?? null,
      });
    const resolvedCustomer = customer ?? await tx.customer.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        departmentId: auth.membership.departmentId,
        code: `EC-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
        name: customerName,
        contactName: customerName,
        contactPhone: recipientPhone || null,
        contactEmail: recipientEmail || null,
      },
      select: { id: true },
    });
    const order = await tx.order.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        departmentId: auth.membership.departmentId,
        siteId: auth.membership.siteId,
        customerId: resolvedCustomer.id,
        orderNo: allocatedOrderNumber.orderNo,
        orderNumberRuleId: allocatedOrderNumber.ruleId,
        creatorUserId: auth.userId,
        ownedByMembershipId: auth.membership.id,
        shopId,
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
          orderNumbering: {
            ruleId: allocatedOrderNumber.ruleId,
            ruleCode: allocatedOrderNumber.ruleCode,
            sequence: allocatedOrderNumber.sequence,
            periodKey: allocatedOrderNumber.periodKey,
            counterScopeKey: allocatedOrderNumber.counterScopeKey,
          },
          capturedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue : undefined,
        items: {
          create: items.map((item: ParsedOrderItem) => ({
            productId: item.productId,
            skuId: item.skuId,
            stockControlled: Boolean(item.skuId),
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
      details: { orderNo: created.orderNo, customerId: created.customerId, orderNumberRuleId: created.orderNumberRuleId },
    });

    return ok(created, { status: 201 });
  } catch (error) {
    if (error instanceof OrderNumberingError) {
      return fail(error.code, error.message, error.code === "ORDER_NUMBER_RULE_REQUIRED" ? 409 : 400);
    }
    throw error;
  }
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
  if (target.status !== "DRAFT") {
    return fail("ORDER_UPDATE_NOT_ALLOWED", "只有草稿或核单退回的订单可以修改。", 409);
  }

  // Do not reduce a department/site/self update permission to a business-unit
  // check. The compiled predicate is also used by lists and dashboards, so a
  // direct API call cannot update a row the caller would not be allowed to see.
  const updateAccess = await createOrderAccessPlan({ membership: auth.membership, actionKey: "order.update" });
  if (!updateAccess.allowed || !updateAccess.allows({
    businessUnitId: target.businessUnitId,
    departmentId: target.departmentId,
    siteId: target.siteId,
    ownerMembershipId: target.ownedByMembershipId,
  })) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: ["ORDER_UPDATE_SCOPE_DENIED"] }, { status: 403 });
  }

  const item = parseSingleOrderItem(body)[0];
  if (!item) return fail("ORDER_ITEM_REQUIRED", "请选择商品和 SKU。", 400);
  const shopId = typeof body.shopId === "string" ? body.shopId.trim().slice(0, 100) : "";
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim().slice(0, 100) : "";
  if (!shopId) return fail("SHOP_ID_REQUIRED", "请填写比特窗口号（店铺 ID）。", 400);
  if (!recipientName) return fail("RECIPIENT_NAME_REQUIRED", "请填写收件人。", 400);
  const sku = item.skuId ? await prisma.productSku.findFirst({
    where: { id: item.skuId, productId: item.productId ?? undefined, isActive: true, product: { businessUnitId: target.businessUnitId, isActive: true } },
    select: { id: true, productId: true },
  }) : null;
  if (!sku) return fail("SKU_OWNERSHIP_MISMATCH", "请选择当前业务板块内有效的 SKU。", 400);
  const orderedAt = typeof body.orderedAt === "string" ? new Date(body.orderedAt) : target.orderedAt;
  if (Number.isNaN(orderedAt.getTime())) return fail("INVALID_ORDER_DATE", "订单日期格式不正确。", 400);
  const packageWeightGrams = Number(body.packageWeightGrams ?? 0);
  if (!Number.isSafeInteger(packageWeightGrams) || packageWeightGrams < 0) return fail("INVALID_PACKAGE_WEIGHT", "包裹重量格式不正确。", 400);
  const productValueCents = item.quantity * item.unitPriceCents;
  const codAmountCents = normalizeMoneyCents(body.codAmountCents ?? 0);
  const shippingFeeCents = normalizeMoneyCents(body.shippingFeeCents ?? 0);
  const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) || null : null;
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: target.id, status: "DRAFT" },
      data: {
        shopId, productValueCents, codAmountCents, shippingFeeCents,
        currency: (text(body.currency, 3) ?? target.currency).toUpperCase(), orderedAt,
        recipientName, recipientPhone: text(body.recipientPhone, 100), recipientEmail: text(body.recipientEmail, 200)?.toLowerCase(),
        recipientCountryCode: text(body.recipientCountryCode, 3)?.toUpperCase(), recipientPostalCode: text(body.recipientPostalCode, 30),
        recipientRegion: text(body.recipientRegion, 100), recipientCity: text(body.recipientCity, 100), recipientAddress: text(body.recipientAddress, 500),
        customerWhatsapp: text(body.customerWhatsapp, 50), staffWhatsapp: text(body.staffWhatsapp, 50), packageWeightGrams,
        paymentMethod: text(body.paymentMethod, 30), logisticsChannel: text(body.logisticsChannel, 50), note: text(body.note, 2000),
        exceptionNote: null,
      },
    });
    await tx.orderItem.deleteMany({ where: { orderId: target.id } });
    await tx.orderItem.create({ data: {
      orderId: target.id, productId: sku.productId, skuId: sku.id, stockControlled: true,
      productName: item.productName, quantity: item.quantity, unitPriceCents: item.unitPriceCents, subtotalCents: productValueCents,
    } });
    await tx.customer.update({ where: { id: target.customerId }, data: {
      name: recipientName, contactName: recipientName, contactPhone: text(body.recipientPhone, 100), contactEmail: text(body.recipientEmail, 200)?.toLowerCase(),
    } });
    return updated;
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: "order.update",
    targetType: "order",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
    details: { changed: "returned_order_details", previousExceptionNote: target.exceptionNote },
  });

  return ok(row);
}
