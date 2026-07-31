import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test.describe.serial("资源中心真实 PostgreSQL 并发与配置界面", () => {
  let businessUnitId = "";
  let membershipId = "";
  let categoryId = "";
  let inStockStatusId = "";
  let assignActionId = "";
  let resourceId = "";

  test.beforeAll(async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        isActive: true,
        user: { username: "founder", isActive: true },
        businessUnit: { isActive: true },
      },
      select: { id: true, businessUnitId: true },
    });
    const [category, status, action] = await Promise.all([
      prisma.resourceCategory.findFirstOrThrow({
        where: { businessUnitId: membership.businessUnitId, code: "EQUIPMENT", isActive: true },
        select: { id: true },
      }),
      prisma.resourceStatus.findFirstOrThrow({
        where: { businessUnitId: membership.businessUnitId, code: "IN_STOCK", isActive: true },
        select: { id: true },
      }),
      prisma.resourceLifecycleAction.findFirstOrThrow({
        where: { businessUnitId: membership.businessUnitId, code: "ASSIGN", isActive: true },
        select: { id: true },
      }),
    ]);

    businessUnitId = membership.businessUnitId;
    membershipId = membership.id;
    categoryId = category.id;
    inStockStatusId = status.id;
    assignActionId = action.id;
  });

  test.afterAll(async () => {
    if (resourceId) {
      await prisma.auditLog.deleteMany({
        where: { module: "mvp.resources", targetId: resourceId },
      });
      await prisma.resourceAsset.deleteMany({ where: { id: resourceId } });
    }
    await prisma.$disconnect();
  });

  async function login(request: import("@playwright/test").APIRequestContext) {
    const response = await request.post("/api/auth/login", {
      data: { username: "founder", password },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  test("资源中心提供配置维护入口，资产流转并发时只允许一次扣减", async ({ page, request }) => {
    await login(request);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = await request.post("/api/mvp/resources", {
      data: {
        resourceNo: `E2E-RESOURCE-${suffix}`,
        name: "资源中心并发验收资产",
        categoryId,
        statusId: inStockStatusId,
        quantity: 1,
        availableQuantity: 1,
        currency: "CNY",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    resourceId = (await created.json()).data.id;

    const transitions = await Promise.all([
      request.post(`/api/mvp/resources/${resourceId}/lifecycle`, {
        data: { lifecycleActionId: assignActionId, nextAssigneeMembershipId: membershipId, note: "E2E 并发分配 A" },
      }),
      request.post(`/api/mvp/resources/${resourceId}/lifecycle`, {
        data: { lifecycleActionId: assignActionId, nextAssigneeMembershipId: membershipId, note: "E2E 并发分配 B" },
      }),
    ]);
    expect(transitions.map((response) => response.status()).sort()).toEqual([200, 409]);

    const asset = await prisma.resourceAsset.findUniqueOrThrow({ where: { id: resourceId } });
    expect(asset.businessUnitId).toBe(businessUnitId);
    expect(asset.availableQuantity).toBe(0);
    expect(asset.availableQuantity).toBeGreaterThanOrEqual(0);
    expect(asset.version).toBe(2);
    expect(await prisma.resourceLifecycleEvent.count({ where: { resourceAssetId: resourceId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { module: "mvp.resources", action: "resource.lifecycle.transition", targetId: resourceId } })).toBe(1);

    await login(page.request);
    await page.goto("/admin/resources");
    await expect(page.getByRole("heading", { name: "资源中心" })).toBeVisible();
    await expect(page.getByRole("button", { name: "资源配置" })).toBeVisible();
    await page.getByRole("button", { name: "资源配置" }).click();
    const picker = page.getByTestId("resource-config-editor-picker");
    await expect(picker).toBeVisible();
    expect(await picker.locator("option").count()).toBeGreaterThan(1);
  });
});
