import { expect, test } from "@playwright/test";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

async function login(page: import("@playwright/test").Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "founder", password },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test("物流工作台显示批次式导出与回传预检入口", async ({ page }) => {
  await login(page);
  await page.goto("/admin/shipping");

  await expect(page.getByRole("heading", { name: "待发货工作台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "物流商导出批次" })).toBeVisible();
  await expect(page.getByText("物流商回传运单号", { exact: true })).toBeVisible();
  await expect(page.getByText(/回填运单号不等于确认发货/)).toBeVisible();
});
