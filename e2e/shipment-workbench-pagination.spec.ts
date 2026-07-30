import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";
const carrier = "E2E-WORKBENCH-PAGINATION";

test.describe.serial("物流工作台分页", () => {
  test.afterAll(async () => {
    await prisma.shipment.deleteMany({ where: { carrier } });
    await prisma.$disconnect();
  });

  test("筛选、翻页与每页数量均保留在地址栏，且跨页不重复", async ({ page }) => {
    const source = await prisma.shipment.findFirstOrThrow({
      where: { status: { not: "PENDING" } },
      select: { orderId: true, legalEntityId: true, businessUnitId: true, siteId: true },
    });
    await prisma.shipment.deleteMany({ where: { carrier } });
    const start = new Date("2026-07-31T00:00:00.000Z");
    for (let index = 1; index <= 12; index += 1) {
      await prisma.shipment.create({
        data: {
          ...source,
          carrier,
          trackingNo: `E2E-WB-TRACK-${String(index).padStart(2, "0")}`,
          status: "IN_TRANSIT",
          shippedAt: new Date(start.getTime() + index * 1_000),
          createdAt: new Date(start.getTime() + index * 1_000),
        },
      });
    }

    const login = await page.request.post("/api/auth/login", {
      data: { username: "founder", password },
    });
    expect(login.ok(), await login.text()).toBe(true);

    await page.goto(`/admin/shipments?carrier=${carrier}`);
    await expect(page.getByText("共 12 条", { exact: true })).toBeVisible();
    await expect(page.getByText("第 1/2 页", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-12", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-01", { exact: true })).toHaveCount(0);

    const next = page.getByRole("button", { name: "下一页", exact: true });
    await expect(next).toHaveCount(1);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`carrier=${carrier}.*page=2|page=2.*carrier=${carrier}`));
    await expect(page.getByText("第 2/2 页", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-01", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-12", { exact: true })).toHaveCount(0);

    const footerPageSize = page.locator("footer select");
    await expect(footerPageSize).toHaveCount(1);
    await footerPageSize.selectOption("20");
    await expect(page).toHaveURL(new RegExp(`carrier=${carrier}.*pageSize=20|pageSize=20.*carrier=${carrier}`));
    await expect(page.getByText("第 1/1 页", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-12", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-WB-TRACK-01", { exact: true })).toBeVisible();
  });
});
