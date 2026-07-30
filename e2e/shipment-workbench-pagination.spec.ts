import { expect, test } from "@playwright/test";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test("物流工作台筛选和分页状态写入地址栏并可刷新恢复", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", {
    data: { username: "founder", password },
  });
  expect(login.ok(), await login.text()).toBe(true);

  await page.goto("/admin/shipments");
  const search = page.getByPlaceholder("订单号、物流单号、客户、销售、产品");
  await expect(search).toBeVisible();
  await search.fill("DEMO-ORDER-001");
  await page.getByRole("button", { name: "搜索", exact: true }).click();

  await expect(page).toHaveURL(/q=DEMO-ORDER-001/);
  await expect(page.getByText("共 1 条", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "DEMO-ORDER-001", exact: true })).toBeVisible();

  await page.reload();
  await expect(search).toHaveValue("DEMO-ORDER-001");
  await expect(page.getByText("共 1 条", { exact: true })).toBeVisible();

  const footerPageSize = page.locator("footer select");
  await expect(footerPageSize).toHaveCount(1);
  await footerPageSize.selectOption("20");
  await expect(page).toHaveURL(/pageSize=20/);
  await expect(page).toHaveURL(/q=DEMO-ORDER-001/);
});
