import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const password = process.env.SEED_DEMO_PASSWORD || "123456.";
const shipmentId = "00000000-0000-4000-8000-000000000201";
const trackingNo = "DEMO-TRACK-001";

test.describe.serial("物流敏感字段动态授权门禁", () => {
  const grantIds: string[] = [];

  test.afterAll(async () => {
    if (grantIds.length > 0) {
      await prisma.accessGrant.deleteMany({ where: { id: { in: grantIds } } });
    }
    await prisma.$disconnect();
  });

  test("物流单号和轨迹可按员工额外授权，并在撤销后立即关闭", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { username: "demo_shipping", password },
    });
    expect(login.ok(), await login.text()).toBe(true);

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { order: { select: { departmentId: true } } },
    });
    const grantee = await prisma.membership.findFirstOrThrow({
      where: { user: { username: "demo_shipping" }, businessUnitId: shipment.businessUnitId, isActive: true },
    });
    const granter = await prisma.membership.findFirstOrThrow({
      where: { user: { username: "founder" }, businessUnitId: shipment.businessUnitId, isActive: true },
    });

    await page.goto(`/admin/shipments/${shipmentId}`);
    await expect(page.getByRole("heading", { name: "物流单号受限" })).toBeVisible();
    await expect(page.getByText(trackingNo, { exact: true })).toHaveCount(0);
    const deniedEvents = await page.request.get(`/api/mvp/shipments/${shipmentId}/events`);
    expect(deniedEvents.status()).toBe(403);

    for (const actionKey of ["shipment.tracking_no.view", "shipment.timeline.view"]) {
      const grant = await prisma.accessGrant.create({
        data: {
          granteeMembershipId: grantee.id,
          granterMembershipId: granter.id,
          actionKey,
          scope: "SITE",
          reason: "E2E 临时验证字段级动态授权",
          businessUnitId: shipment.businessUnitId,
          departmentId: shipment.order.departmentId,
          siteId: shipment.siteId,
        },
      });
      grantIds.push(grant.id);
    }

    await page.reload();
    await expect(page.getByRole("heading", { name: trackingNo })).toBeVisible();
    const allowedEvents = await page.request.get(`/api/mvp/shipments/${shipmentId}/events`);
    expect(allowedEvents.status(), await allowedEvents.text()).toBe(200);
    expect((await allowedEvents.json()).data.length).toBeGreaterThan(0);

    await prisma.accessGrant.updateMany({
      where: { id: { in: grantIds } },
      data: { isActive: false, revokedAt: new Date() },
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "物流单号受限" })).toBeVisible();
    await expect(page.getByText(trackingNo, { exact: true })).toHaveCount(0);
    const revokedEvents = await page.request.get(`/api/mvp/shipments/${shipmentId}/events`);
    expect(revokedEvents.status()).toBe(403);
  });
});
