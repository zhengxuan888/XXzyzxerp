import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { localDemoStorage } from "@/lib/storage/local-demo";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";
const prisma = new PrismaClient();
let createdDocumentId = "";
let createdStorageKey = "";

async function login(page: import("@playwright/test").Page, username: string) {
  const response = await page.request.post("/api/auth/login", { data: { username, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("文档中心完成上传、审核、受控预览、归档与跨人员隔离", async ({ page }) => {
  await login(page, "founder");
  await page.goto("/admin/documents");
  await expect(page.getByRole("heading", { name: "文档中心" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上传文档" })).toBeVisible();

  const categories = await page.request.get("/api/mvp/document-config").then(async (response) => ({ status: response.status(), body: await response.json() }));
  expect(categories.status).toBe(200);
  const categoryId = categories.body.data[0]?.id as string | undefined;
  expect(categoryId).toBeTruthy();

  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=", "base64");
  const title = `文档中心验收-${Date.now()}`;
  const created = await page.request.post("/api/mvp/documents", {
    multipart: {
      title,
      categoryId: categoryId!,
      targetType: "GENERAL",
      file: { name: "验收资料.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const document = (await created.json()).data as { id: string; version: number; reviewStatus: string };
  createdDocumentId = document.id;
  const persistedDocument = await prisma.document.findUniqueOrThrow({
    where: { id: document.id },
    select: { attachment: { select: { id: true, storageKey: true } } },
  });
  const createdAttachmentId = persistedDocument.attachment?.id;
  createdStorageKey = persistedDocument.attachment?.storageKey ?? "";
  expect(createdAttachmentId).toBeTruthy();
  expect(document.reviewStatus).toBe("PENDING_REVIEW");

  const pending = await page.request.get(`/api/mvp/documents?status=PENDING_REVIEW&q=${encodeURIComponent(title)}`).then((response) => response.json());
  expect(pending.data.some((row: { id: string }) => row.id === document.id)).toBe(true);

  const approved = await page.request.patch(`/api/mvp/documents/${document.id}`, {
    data: { operation: "review", reviewStatus: "APPROVED", reviewNote: "验收通过", version: document.version },
  });
  expect(approved.status(), await approved.text()).toBe(200);
  const reviewed = (await approved.json()).data as { version: number; reviewStatus: string };
  expect(reviewed.reviewStatus).toBe("APPROVED");
  const reviewAudit = await prisma.auditLog.findFirst({
    where: { module: "mvp.documents", action: "document.review.approve", targetId: document.id },
    orderBy: { createdAt: "desc" },
  });
  expect(JSON.stringify(reviewAudit?.details ?? {})).not.toContain("验收通过");

  const content = await page.request.get(`/api/mvp/documents/${document.id}/content`);
  expect(content.status()).toBe(200);
  expect(content.headers()["content-type"]).toContain("image/png");

  await prisma.attachment.update({ where: { id: createdAttachmentId! }, data: { targetId: `mismatched-${document.id}` } });
  const invalidBinding = await page.request.get(`/api/mvp/documents/${document.id}/content`);
  expect(invalidBinding.status()).toBe(404);
  await prisma.attachment.update({ where: { id: createdAttachmentId! }, data: { targetId: document.id } });

  await page.context().clearCookies();
  await login(page, "demo_sales");
  const forbidden = await page.request.get(`/api/mvp/documents/${document.id}/content`);
  expect(forbidden.status()).toBe(404);

  await page.context().clearCookies();
  await login(page, "founder");
  const archived = await page.request.patch(`/api/mvp/documents/${document.id}`, {
    data: { operation: "archive", version: reviewed.version },
  });
  expect(archived.status(), await archived.text()).toBe(200);
  const normalList = await page.request.get(`/api/mvp/documents?q=${encodeURIComponent(title)}`).then((response) => response.json());
  expect(normalList.data.some((row: { id: string }) => row.id === document.id)).toBe(false);
});

test.afterAll(async () => {
  if (createdDocumentId) {
    const document = await prisma.document.findUnique({ where: { id: createdDocumentId }, select: { attachmentId: true } });
    await prisma.auditLog.deleteMany({ where: { module: "mvp.documents", targetId: createdDocumentId } });
    await prisma.document.deleteMany({ where: { id: createdDocumentId } });
    if (document?.attachmentId) await prisma.attachment.deleteMany({ where: { id: document.attachmentId } });
  }
  if (createdStorageKey) await localDemoStorage.delete(createdStorageKey);
  await prisma.$disconnect();
});
