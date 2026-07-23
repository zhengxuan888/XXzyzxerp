import { expect, test } from "@playwright/test";

const username = "founder";
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

async function login(page: import("@playwright/test").Page, account = username, accountPassword = password) {
  await page.goto("/login");
  await page.getByLabel("用户名", { exact: true }).fill(account);
  await page.getByLabel("密码", { exact: true }).fill(accountPassword);
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

test("统一收件箱可完成 Demo 消息、状态和客户关联闭环", async ({ page }) => {
  await login(page);
  await page.goto("/admin/inbox");
  await expect(page.getByRole("heading", { name: "统一收件箱" })).toBeVisible();
  await expect(page.getByText("演示咨询客户").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "会话图片与附件" })).toBeVisible();
  await page.getByRole("button", { name: "拉取演示消息" }).click();
  await expect(page.getByRole("article").getByText("可以帮我确认预计送达时间吗？").last()).toBeVisible();
  await page.getByLabel("处理状态").selectOption("PENDING");
  await expect(page.getByText("跟进中").first()).toBeVisible();
  await page.getByLabel("关联客户/线索").selectOption({ index: 1 });
  await expect(page.getByText(/已关联：/)).toBeVisible();
});

test("统一收件箱移动端无页面级水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/admin/inbox");
  await expect(page.getByRole("heading", { name: "统一收件箱" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("中文用户名可登录，受限账号的菜单、直链和 API 同时拒绝", async ({ page }) => {
  await login(page, "测试员工_中文", password);
  await expect(page.getByRole("link", { name: "统一收件箱" })).toHaveCount(0);
  const apiStatus = await page.evaluate(async () => (await fetch("/api/mvp/inbox")).status);
  expect(apiStatus).toBe(403);
  await page.goto("/admin/inbox");
  await expect(page).toHaveURL(/\/admin$/);
});

test("核心列表 API 使用统一分页结构且分页间不重复", async ({ page }) => {
  await login(page);
  for (const endpoint of ["customers", "products", "orders", "inventory", "shipments", "expenses"]) {
    const result = await page.evaluate(async (path) => {
      const first = await fetch(`/api/mvp/${path}?page=1&pageSize=1`).then((response) => response.json());
      const second = await fetch(`/api/mvp/${path}?page=2&pageSize=1`).then((response) => response.json());
      return { first, second };
    }, endpoint);
    expect(result.first.ok).toBe(true);
    expect(result.first.meta).toEqual(expect.objectContaining({ page: 1, pageSize: 1 }));
    const firstId = result.first.data[0]?.id;
    const secondId = result.second.data[0]?.id;
    if (firstId && secondId) expect(firstId).not.toBe(secondId);
  }
  const inbox = await page.evaluate(async () => fetch("/api/mvp/inbox?page=1&pageSize=1").then((response) => response.json()));
  expect(inbox.ok).toBe(true);
  expect(inbox.data.meta).toEqual(expect.objectContaining({ page: 1, pageSize: 1 }));
});

test("库存防负数、幂等调整和金额整数门禁", async ({ page }) => {
  await login(page);
  const before = await page.evaluate(async () => fetch("/api/mvp/inventory?page=1&pageSize=100").then((response) => response.json()));
  const balance = before.data[0];
  expect(balance).toBeTruthy();
  const negativeStatus = await page.evaluate(async ({ siteId, skuId }) => {
    const response = await fetch("/api/mvp/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, skuId, quantityDelta: -999999999, idempotencyKey: `negative-${crypto.randomUUID()}` }),
    });
    return response.status;
  }, { siteId: balance.siteId, skuId: balance.skuId });
  expect(negativeStatus).toBe(409);

  const idempotencyKey = `acceptance-${Date.now()}-${Math.random()}`;
  const adjustments = await page.evaluate(async ({ siteId, skuId, idempotencyKey }) => {
    const body = JSON.stringify({ siteId, skuId, quantityDelta: 1, idempotencyKey });
    const first = await fetch("/api/mvp/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((response) => response.json());
    const second = await fetch("/api/mvp/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((response) => response.json());
    return { first, second };
  }, { siteId: balance.siteId, skuId: balance.skuId, idempotencyKey });
  expect(adjustments.first.data.id).toBe(adjustments.second.data.id);

  const after = await page.evaluate(async () => fetch("/api/mvp/inventory?page=1&pageSize=100").then((response) => response.json()));
  const updated = after.data.find((item: { id: string }) => item.id === balance.id);
  expect(updated.onHandQuantity).toBe(balance.onHandQuantity + 1);

  const invalidMoneyStatus = await page.evaluate(async () => {
    const response = await fetch("/api/mvp/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "验收", amountCents: 10.5 }),
    });
    return response.status;
  });
  expect(invalidMoneyStatus).toBe(400);
});

test("统一收件箱错误状态可见且不会显示空白页", async ({ page }) => {
  await login(page);
  await page.route("**/api/mvp/inbox", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SIMULATED_OFFLINE" }) });
  });
  await page.goto("/admin/inbox");
  await expect(page.getByText("SIMULATED_OFFLINE", { exact: true })).toBeVisible();
  await expect(page.getByText("正在加载会话…")).toBeVisible();
});

test("移动端订单录入核心页面无页面级水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "录入订单" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("商品图片完成安全上传、预览、404 占位与删除", async ({ page }) => {
  await login(page);
  const products = await page.evaluate(async () => fetch("/api/mvp/products?page=1&pageSize=1").then((response) => response.json()));
  const productId = products.data[0].id;
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByRole("heading", { name: "商品图片与资料" })).toBeVisible();

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=", "base64");
  const uploadName = `acceptance-${Date.now()}.png`;
  await page.getByLabel("选择附件").setInputFiles({ name: uploadName, mimeType: "image/png", buffer: png });
  await expect(page.getByAltText(uploadName)).toBeVisible();

  await page.route("**/api/mvp/attachments/*/content**", async (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.reload();
  await expect(page.getByText("图片加载失败")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await page.unroute("**/api/mvp/attachments/*/content**");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("article").filter({ hasText: uploadName }).getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(uploadName)).toHaveCount(0);
});

test("附件拒绝伪造类型、超限文件和无权限上传", async ({ page }) => {
  await login(page);
  const products = await page.evaluate(async () => fetch("/api/mvp/products?page=1&pageSize=1").then((response) => response.json()));
  const productId = products.data[0].id;
  await page.goto(`/admin/products/${productId}`);
  await page.getByLabel("选择附件").setInputFiles({ name: "malware.png", mimeType: "image/png", buffer: Buffer.from("MZ executable") });
  await expect(page.getByText("文件类型、扩展名、签名或大小不符合安全规则。", { exact: true })).toBeVisible();

  const oversizedStatus = await page.evaluate(async (targetId) => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("targetType", "PRODUCT");
    form.set("targetId", targetId);
    form.set("file", new File([bytes], "large.png", { type: "image/png" }));
    return (await fetch("/api/mvp/attachments", { method: "POST", body: form })).status;
  }, productId);
  expect(oversizedStatus).toBe(413);

  await page.context().clearCookies();
  await login(page, "测试员工_中文", password);
  const forbiddenStatus = await page.evaluate(async (targetId) => {
    const form = new FormData();
    form.set("targetType", "PRODUCT");
    form.set("targetId", targetId);
    form.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "test.png", { type: "image/png" }));
    return (await fetch("/api/mvp/attachments", { method: "POST", body: form })).status;
  }, productId);
  expect(forbiddenStatus).toBe(403);
});
