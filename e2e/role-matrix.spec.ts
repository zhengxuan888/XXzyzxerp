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

test("业务负责人只能查看当前组织上下文，不能创建公司或业务板块", async ({ page }) => {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { username: "demo_manager", password },
  });
  expect(loginResponse.ok(), await loginResponse.text()).toBe(true);

  for (const route of [
    "/admin/organizations",
    "/admin/business-units",
    "/admin/departments",
    "/admin/sites",
    "/admin/users",
    "/admin/memberships",
    "/admin/roles",
    "/admin/access-grants",
    "/admin/approvals",
  ]) {
    const response = await page.request.get(route);
    expect(response.ok(), `业务负责人无法打开 ${route}`).toBe(true);
    expect(new URL(response.url()).pathname, `业务负责人打开 ${route} 时发生权限跳转`).toBe(route);
  }

  const legalEntityCreate = await page.request.post("/api/admin/legal-entities", {
    data: { code: "FORBIDDEN_LE", name: "禁止创建的公司" },
  });
  expect(legalEntityCreate.status()).toBe(403);

  const businessUnitCreate = await page.request.post("/api/admin/business-units", {
    data: { code: "FORBIDDEN_BU", name: "禁止创建的业务板块", legalEntityId: "forbidden" },
  });
  expect(businessUnitCreate.status()).toBe(403);
});

test("销售只能读取自己的订单，业务负责人可以读取本板块订单", async ({ page }) => {
  const login = async (username: string) => {
    const response = await page.request.post("/api/auth/login", { data: { username, password } });
    expect(response.ok(), `${username}: ${await response.text()}`).toBe(true);
  };
  const readOrders = async () => {
    const response = await page.request.get("/api/mvp/orders?page=1&pageSize=100");
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json() as { data: Array<{ id: string; orderNo: string; creatorUser: { username: string } }> };
  };

  await login("demo_manager");
  const managerOrders = await readOrders();
  const peerOrder = managerOrders.data.find((order) => order.orderNo === "DEMO-PEER-ORDER-001");
  const shippedOrder = managerOrders.data.find((order) => order.orderNo === "DEMO-ORDER-001");
  expect(peerOrder).toBeTruthy();
  expect(shippedOrder).toBeTruthy();

  await login("demo_sales");
  const salesOrders = await readOrders();
  expect(salesOrders.data.length).toBeGreaterThan(0);
  expect(salesOrders.data.every((order) => order.creatorUser.username === "demo_sales")).toBe(true);
  expect(salesOrders.data.some((order) => order.orderNo === "DEMO-PEER-ORDER-001")).toBe(false);
  const peerDetail = await page.request.get(`/api/mvp/orders/${peerOrder!.id}`);
  expect(peerDetail.status()).toBe(403);
  const salesShipmentDetailResponse = await page.request.get(`/api/mvp/orders/${shippedOrder!.id}`);
  expect(salesShipmentDetailResponse.ok(), await salesShipmentDetailResponse.text()).toBe(true);
  const salesShipmentDetail = await salesShipmentDetailResponse.json() as {
    shipments: Array<{ trackingNo: string | null; events: unknown[] }>;
  };
  expect(salesShipmentDetail.shipments.length).toBeGreaterThan(0);
  expect(salesShipmentDetail.shipments.every((shipment) => shipment.trackingNo === null && shipment.events.length === 0)).toBe(true);
  const salesOrderPage = await page.request.get(`/admin/orders/${shippedOrder!.id}`);
  expect(await salesOrderPage.text()).not.toContain("DEMO-TRACK-001");

  await login("demo_sales_peer");
  const peerOrders = await readOrders();
  expect(peerOrders.data.some((order) => order.orderNo === "DEMO-PEER-ORDER-001")).toBe(true);
  expect(peerOrders.data.some((order) => order.orderNo === "DEMO-ORDER-001")).toBe(false);

  await login("demo_after_sales");
  const afterSalesDetailResponse = await page.request.get(`/api/mvp/orders/${shippedOrder!.id}`);
  expect(afterSalesDetailResponse.ok(), await afterSalesDetailResponse.text()).toBe(true);
  const afterSalesDetail = await afterSalesDetailResponse.json() as {
    shipments: Array<{ trackingNo: string | null; events: unknown[] }>;
  };
  expect(afterSalesDetail.shipments.some((shipment) => shipment.trackingNo === "DEMO-TRACK-001")).toBe(true);
  expect(afterSalesDetail.shipments.some((shipment) => shipment.events.length > 0)).toBe(true);
  const afterSalesOrderPage = await page.request.get(`/admin/orders/${shippedOrder!.id}`);
  expect(await afterSalesOrderPage.text()).toContain("DEMO-TRACK-001");
});
