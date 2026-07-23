import { expect, test } from "@playwright/test";

const username = "founder";
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("登录后可看到岗位工作台和核心业务入口", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "我的工作台" })).toBeVisible();
  await expect(page.getByRole("link", { name: /录入订单/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /订单核单/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /发货处理/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /跟单售后/ })).toBeVisible();
});

test("订单录入包含模板、客户邮箱和订单列表", async ({ page }) => {
  await login(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "录入订单" })).toBeVisible();
  await expect(page.getByRole("main").getByText("订单模板", { exact: true })).toBeVisible();
  await expect(page.getByLabel("客户邮箱*")).toBeVisible();
  await expect(page.getByRole("heading", { name: "订单列表" })).toBeVisible();
});

test("移动端登录页无水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("button", { name: "进入工作台" })).toBeVisible();
});
