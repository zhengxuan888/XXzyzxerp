import { expect, test, type APIRequestContext } from "@playwright/test";

const password = process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026";
const endpoints = [
  "/api/mvp/announcements",
  "/api/mvp/documents",
  "/api/mvp/approvals",
  "/api/mvp/attendance",
  "/api/mvp/leave-requests",
] as const;

type PaginatedPayload = {
  ok: true;
  data: unknown[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

async function readPage(request: APIRequestContext, endpoint: string, page: number) {
  const response = await request.get(`${endpoint}?page=${page}&pageSize=1`);
  expect(response.status(), await response.text()).toBe(200);
  const payload = (await response.json()) as PaginatedPayload;
  expect(payload.ok).toBe(true);
  expect(Array.isArray(payload.data)).toBe(true);
  expect(payload.meta.page).toBe(page);
  expect(payload.meta.pageSize).toBe(1);
  expect(payload.meta.total).toBeGreaterThanOrEqual(payload.data.length);
  expect(payload.meta.pageCount).toBe(Math.ceil(payload.meta.total / payload.meta.pageSize));
  return payload;
}

test("次级业务列表统一分页、稳定排序且翻页不重复", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { username: "founder", password },
  });
  expect(login.ok(), await login.text()).toBe(true);

  for (const endpoint of endpoints) {
    const first = await readPage(request, endpoint, 1);
    if (first.meta.total > 1) {
      const second = await readPage(request, endpoint, 2);
      const firstId = (first.data[0] as { id?: string } | undefined)?.id;
      const secondId = (second.data[0] as { id?: string } | undefined)?.id;
      expect(firstId).toBeTruthy();
      expect(secondId).toBeTruthy();
      expect(secondId).not.toBe(firstId);
    }
  }
});
