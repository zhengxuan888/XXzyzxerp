import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const password = process.env.SEED_DEMO_PASSWORD || "123456.";

test.describe.serial("订单提交与库存预占并发门禁", () => {
  let legalEntityId = "";
  let businessUnitId = "";
  let departmentId: string | null = null;
  let siteId = "";
  let userId = "";
  let membershipId = "";
  let customerId = "";
  let productId = "";
  let skuId = "";
  const orderIds: string[] = [];

  test.beforeAll(async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        isActive: true,
        user: { username: "demo_sales", isActive: true },
        businessUnit: { isActive: true },
        siteId: { not: null },
      },
      include: { businessUnit: true },
    });
    legalEntityId = membership.businessUnit.legalEntityId;
    businessUnitId = membership.businessUnitId;
    departmentId = membership.departmentId;
    siteId = membership.siteId!;
    userId = membership.userId;
    membershipId = membership.id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const customer = await prisma.customer.create({
      data: {
        legalEntityId,
        businessUnitId,
        departmentId,
        code: `CONCURRENCY-CUSTOMER-${suffix}`,
        name: `并发验收客户-${suffix}`,
        contactEmail: `concurrency-${suffix}@example.com`,
      },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        legalEntityId,
        businessUnitId,
        code: `ORDER-CONCURRENCY-${suffix}`,
        name: "订单并发预占验收商品",
        skus: { create: { code: `ORDER-CONCURRENCY-SKU-${suffix}` } },
      },
      include: { skus: true },
    });
    productId = product.id;
    skuId = product.skus[0].id;
  });

  test.afterAll(async () => {
    if (orderIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { module: "sales.order_workflow", targetId: { in: orderIds } },
      });
      await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.attachment.deleteMany({ where: { targetType: "ORDER", targetId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (skuId) {
      await prisma.inventoryBalance.deleteMany({ where: { skuId } });
    }
    if (productId) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    if (customerId) {
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function login(request: import("@playwright/test").APIRequestContext) {
    const response = await request.post("/api/auth/login", {
      data: { username: "demo_sales", password },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  async function createDraftOrder(label: string) {
    const order = await prisma.order.create({
      data: {
        legalEntityId,
        businessUnitId,
        departmentId,
        siteId,
        customerId,
        orderNo: `CONCURRENCY-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        creatorUserId: userId,
        ownedByMembershipId: membershipId,
        status: "DRAFT",
        currency: "EUR",
        productValueCents: 2999,
        codAmountCents: 2999,
        recipientName: "并发验收收件人",
        recipientPhone: "+34123456789",
        recipientEmail: "order-concurrency@example.com",
        recipientCountryCode: "ES",
        recipientCity: "Madrid",
        recipientAddress: "Concurrency Street 1",
        paymentMethod: "COD",
        items: {
          create: {
            productId,
            skuId,
            productName: "订单并发预占验收商品",
            quantity: 1,
            unitPriceCents: 2999,
            subtotalCents: 2999,
          },
        },
      },
    });
    orderIds.push(order.id);
    await prisma.attachment.create({
      data: {
        legalEntityId,
        businessUnitId,
        departmentId,
        targetType: "ORDER",
        targetId: order.id,
        originalName: "concurrency-proof.png",
        storageProvider: "TEST",
        storageKey: `e2e/order-concurrency/${order.id}.png`,
        mimeType: "image/png",
        extension: ".png",
        sizeBytes: 8,
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        uploadedByUserId: userId,
        uploadedByMembershipId: membershipId,
      },
    });
    return order;
  }

  test("两个订单争抢最后一件库存时只能一个提交成功", async ({ request }) => {
    await login(request);
    await prisma.inventoryBalance.create({
      data: { businessUnitId, siteId, skuId, onHandQuantity: 1 },
    });
    const first = await createDraftOrder("A");
    const second = await createDraftOrder("B");

    const responses = await Promise.all([
      request.post(`/api/mvp/orders/${first.id}/actions`, { data: { action: "submit" } }),
      request.post(`/api/mvp/orders/${second.id}/actions`, { data: { action: "submit" } }),
    ]);

    expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
    const orders = await prisma.order.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { status: true },
    });
    expect(orders.map((order) => order.status).sort()).toEqual(["DRAFT", "SUBMITTED"]);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { businessUnitId_siteId_skuId: { businessUnitId, siteId, skuId } },
    });
    expect(balance.onHandQuantity).toBe(0);
    expect(balance.reservedQuantity).toBe(1);
    expect(await prisma.inventoryReservation.count({ where: { orderId: { in: [first.id, second.id] } } })).toBe(1);
    expect(await prisma.inventoryTransaction.count({ where: { orderId: { in: [first.id, second.id] }, type: "RESERVE" } })).toBe(1);
  });

  test("同一订单并发重复提交不会重复占库或重复写审计", async ({ request }) => {
    await login(request);
    await prisma.inventoryBalance.update({
      where: { businessUnitId_siteId_skuId: { businessUnitId, siteId, skuId } },
      data: { onHandQuantity: 1, reservedQuantity: 0 },
    });
    const order = await createDraftOrder("SAME");

    const responses = await Promise.all([
      request.post(`/api/mvp/orders/${order.id}/actions`, { data: { action: "submit" } }),
      request.post(`/api/mvp/orders/${order.id}/actions`, { data: { action: "submit" } }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshed.status).toBe("SUBMITTED");
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { businessUnitId_siteId_skuId: { businessUnitId, siteId, skuId } },
    });
    expect(balance.onHandQuantity).toBe(0);
    expect(balance.reservedQuantity).toBe(1);
    expect(await prisma.inventoryReservation.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.inventoryTransaction.count({ where: { orderId: order.id, type: "RESERVE" } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { module: "sales.order_workflow", action: "order.submit", targetId: order.id },
      }),
    ).toBe(1);
  });
});
