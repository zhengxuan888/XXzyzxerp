import { expect, test } from "@playwright/test";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test("库存工作台提供稳定分页与安全库存派生字段", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", {
    data: { username: "founder", password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const inventory = await page.request.get("/api/mvp/inventory?page=1&pageSize=10&sort=AVAILABLE_ASC");
  expect(inventory.status()).toBe(200);
  const payload = await inventory.json() as {
    ok: boolean;
    data: Array<{ availableQuantity: number; skuAvailableQuantity: number; stockStatus: string }>;
    meta: { page: number; pageSize: number; total: number };
  };
  expect(payload.ok).toBe(true);
  expect(payload.meta).toMatchObject({ page: 1, pageSize: 10 });
  expect(Array.isArray(payload.data)).toBe(true);
  payload.data.forEach((row) => {
    expect(typeof row.availableQuantity).toBe("number");
    expect(typeof row.skuAvailableQuantity).toBe("number");
    expect(["NORMAL", "LOW_STOCK", "OUT_OF_STOCK"]).toContain(row.stockStatus);
  });

  const pageResponse = await page.goto("/admin/inventory?stock=OUT_OF_STOCK&pageSize=10");
  expect(pageResponse?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "库存工作台" })).toBeVisible();
});
