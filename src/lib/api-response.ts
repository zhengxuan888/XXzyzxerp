import { NextRequest, NextResponse } from "next/server";

export type Pagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function parsePagination(request: NextRequest, maxPageSize = 100): Pagination {
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const requestedPageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 20);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, maxPageSize)
      : 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200 });
}

export function paginated<T>(items: T[], total: number, pagination: Pagination) {
  return NextResponse.json({
    ok: true,
    data: items,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      pageCount: Math.ceil(total / pagination.pageSize),
    },
  });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}
