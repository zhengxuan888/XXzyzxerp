import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test.describe.serial("真实 PostgreSQL 库存并发门禁", () => {
  let businessUnitId = "";
  let siteId = "";
  let productId = "";
  let skuId = "";
  const createdTransactionIds: string[] = [];

  test.beforeAll(async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        isActive: true,
        user: { username: "founder", isActive: true },
        businessUnit: { isActive: true },
      },
      include: {
        businessUnit: { include: { legalEntity: true } },
      },
    });
    const site = await prisma.site.findFirstOrThrow({
      where: { businessUnitId: membership.businessUnitId, isActive: true },
    });
    businessUnitId = membership.businessUnitId;
    siteId = site.id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const product = await prisma.product.create({
      data: {
        legalEntityId: membership.businessUnit.legalEntityId,
        businessUnitId,
        code: `CONCURRENCY-${suffix}`,
        name: "并发库存验收临时商品",
        skus: {
          create: {
            code: `CONCURRENCY-SKU-${suffix}`,
          },
        },
      },
      include: { skus: true },
    });
    productId = product.id;
    skuId = product.skus[0].id;
    await prisma.inventoryBalance.create({
      data: {
        businessUnitId,
        siteId,
        skuId,
        onHandQuantity: 1,
      },
    });
  });

  test.afterAll(async () => {
    if (createdTransactionIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          module: "mvp.inventory",
          targetId: { in: createdTransactionIds },
        },
      });
    }
    if (skuId) {
      await prisma.inventoryTransaction.deleteMany({ where: { skuId } });
      await prisma.inventoryBalance.deleteMany({ where: { skuId } });
    }
    if (productId) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function login(request: import("@playwright/test").APIRequestContext) {
    const response = await request.post("/api/auth/login", {
      data: { username: "founder", password },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  test("库存为 1 时两个不同请求只有一个成功且永不为负", async ({ request }) => {
    await login(request);
    const prefix = `oversell-${Date.now()}`;
    const responses = await Promise.all([
      request.post("/api/mvp/inventory", {
        data: { siteId, skuId, quantityDelta: -1, idempotencyKey: `${prefix}-a` },
      }),
      request.post("/api/mvp/inventory", {
        data: { siteId, skuId, quantityDelta: -1, idempotencyKey: `${prefix}-b` },
      }),
    ]);

    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    for (const response of responses) {
      const payload = await response.json();
      if (response.status() === 201) createdTransactionIds.push(payload.data.id);
      if (response.status() === 409) expect(payload.error.code).toBe("INSUFFICIENT_STOCK");
    }

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { businessUnitId_siteId_skuId: { businessUnitId, siteId, skuId } },
    });
    expect(balance.onHandQuantity).toBe(0);
    expect(balance.onHandQuantity).toBeGreaterThanOrEqual(0);
    expect(
      await prisma.inventoryTransaction.count({
        where: { businessUnitId, idempotencyKey: { startsWith: prefix } },
      }),
    ).toBe(1);
  });

  test("相同幂等键并发提交只扣一次并返回同一流水", async ({ request }) => {
    await login(request);
    const topUpKey = `topup-${Date.now()}`;
    const topUp = await request.post("/api/mvp/inventory", {
      data: { siteId, skuId, quantityDelta: 1, idempotencyKey: topUpKey },
    });
    expect(topUp.status(), await topUp.text()).toBe(201);
    createdTransactionIds.push((await topUp.json()).data.id);

    const idempotencyKey = `same-key-${Date.now()}`;
    const responses = await Promise.all([
      request.post("/api/mvp/inventory", {
        data: { siteId, skuId, quantityDelta: -1, idempotencyKey },
      }),
      request.post("/api/mvp/inventory", {
        data: { siteId, skuId, quantityDelta: -1, idempotencyKey },
      }),
    ]);
    expect(responses.every((response) => response.ok())).toBe(true);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    expect(payloads[0].data.id).toBe(payloads[1].data.id);
    createdTransactionIds.push(payloads[0].data.id);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { businessUnitId_siteId_skuId: { businessUnitId, siteId, skuId } },
    });
    expect(balance.onHandQuantity).toBe(0);
    expect(
      await prisma.inventoryTransaction.count({
        where: { businessUnitId, idempotencyKey },
      }),
    ).toBe(1);
  });
});
