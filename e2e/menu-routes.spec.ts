import { expect, test } from "@playwright/test";

const username = "founder";
const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";

test("平台管理员可见菜单均有可访问且非空的页面", async ({ page }) => {
  test.setTimeout(120_000);
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { username, password },
  });
  expect(loginResponse.ok(), await loginResponse.text()).toBe(true);

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);

  const navigation = page.getByRole("navigation", { name: "主导航" });
  const collapsedGroups = navigation.locator("button[aria-expanded='false']");
  while (await collapsedGroups.count()) {
    await collapsedGroups.first().click();
  }

  const routes = await navigation.locator("a[href^='/admin']").evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)))],
  );
  expect(routes.length).toBeGreaterThan(10);

  const failures: string[] = [];
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) {
      failures.push(`${route}: HTTP ${response?.status() ?? "无响应"}`);
      continue;
    }
    if (/\/login(?:\?|$)/.test(page.url())) {
      failures.push(`${route}: 被错误重定向到登录页`);
      continue;
    }
    const main = page.getByRole("main");
    if ((await main.count()) !== 1) {
      failures.push(`${route}: 缺少唯一主内容区`);
      continue;
    }
    const text = (await main.innerText()).replace(/\s+/g, "");
    if (text.length < 8) failures.push(`${route}: 主内容为空`);
  }

  expect(failures, failures.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
