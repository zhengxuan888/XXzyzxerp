import { expect, test } from "@playwright/test";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test("商品与 SKU 导入工具可下载通用模板并按权限导出", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", {
    data: { username: "founder", password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const pageResponse = await page.goto("/admin/products");
  expect(pageResponse?.ok()).toBeTruthy();

  const template = await page.request.get("/api/mvp/products/import/template");
  expect(template.status()).toBe(200);
  expect(template.headers()["content-type"]).toContain("spreadsheetml");
  expect(template.headers()["content-disposition"]).toContain("attachment");

  const exportFile = await page.request.get("/api/mvp/products/export");
  expect(exportFile.status()).toBe(200);
  expect(exportFile.headers()["content-type"]).toContain("spreadsheetml");
  expect(exportFile.headers()["content-disposition"]).toContain("attachment");
});
