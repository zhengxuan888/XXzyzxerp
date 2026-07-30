import { expect, test } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD || "123456";

const profiles = [
  {
    username: "demo_sales",
    visible: ["/admin/orders", "/admin/customers", "/admin/products", "/admin/daily-goals", "/admin/leave-requests"],
    hidden: ["/admin/order-review", "/admin/shipping", "/admin/shipments", "/admin/expenses", "/admin/users"],
    forbiddenApi: "/api/mvp/expenses",
  },
  {
    username: "demo_reviewer",
    visible: ["/admin/orders", "/admin/order-review", "/admin/approvals"],
    hidden: ["/admin/shipping", "/admin/shipments", "/admin/expenses", "/admin/users"],
    forbiddenApi: "/api/mvp/shipments",
  },
  {
    username: "demo_shipping",
    visible: ["/admin/orders", "/admin/shipping", "/admin/shipments"],
    hidden: ["/admin/order-review", "/admin/expenses", "/admin/users"],
    forbiddenApi: "/api/mvp/expenses",
  },
  {
    username: "demo_after_sales",
    visible: ["/admin/orders", "/admin/shipments", "/admin/inbox"],
    hidden: ["/admin/order-review", "/admin/shipping", "/admin/expenses", "/admin/users"],
    forbiddenApi: "/api/mvp/expenses",
  },
  {
    username: "demo_finance",
    visible: ["/admin/orders", "/admin/expenses", "/admin/approvals"],
    hidden: ["/admin/order-review", "/admin/shipping", "/admin/shipments", "/admin/users"],
    forbiddenApi: "/api/mvp/shipments",
  },
  {
    username: "demo_hr",
    visible: ["/admin/users", "/admin/memberships", "/admin/departments", "/admin/attendance", "/admin/leave-requests", "/admin/announcements"],
    hidden: ["/admin/orders", "/admin/order-review", "/admin/shipping", "/admin/shipments", "/admin/expenses"],
    forbiddenApi: "/api/mvp/orders",
  },
] as const;

for (const profile of profiles) {
  test(`${profile.username} 的菜单、直链和 API 权限一致`, async ({ page }) => {
    const loginResponse = await page.request.post("/api/auth/login", {
      data: { username: profile.username, password },
    });
    expect(loginResponse.ok(), `${profile.username}: ${await loginResponse.text()}`).toBe(true);

    const menuResponse = await page.request.get("/api/admin/menu-tree");
    expect(menuResponse.ok(), `${profile.username}: ${await menuResponse.text()}`).toBe(true);
    const menuBody = await menuResponse.json() as { menuItems: Array<{ key: string; path: string }> };
    const visiblePaths = new Set(
      menuBody.menuItems.filter((item) => !item.key.startsWith("group-")).map((item) => item.path),
    );

    for (const route of profile.visible) {
      expect(visiblePaths.has(route), `${profile.username} 缺少 ${route}`).toBe(true);
      const routeResponse = await page.request.get(route);
      expect(routeResponse.ok(), `${profile.username} 无法打开 ${route}`).toBe(true);
      expect(new URL(routeResponse.url()).pathname, `${profile.username} 打开 ${route} 时发生权限跳转`).toBe(route);
    }
    for (const route of profile.hidden) expect(visiblePaths.has(route), `${profile.username} 不应看到 ${route}`).toBe(false);

    await page.goto(profile.hidden[0]);
    await expect(page).toHaveURL(/\/admin$/);

    const forbiddenResponse = await page.request.get(profile.forbiddenApi);
    expect(forbiddenResponse.status(), `${profile.username} 越权访问 ${profile.forbiddenApi}`).toBe(403);
  });
}
