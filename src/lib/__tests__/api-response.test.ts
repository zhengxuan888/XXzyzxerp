import { describe, expect, it } from "vitest";

import { parsePagination } from "../api-response";

function request(query: string) {
  return { nextUrl: new URL(`https://erp.local/api${query}`) } as never;
}

describe("pagination protocol", () => {
  it("uses safe defaults and a fixed upper bound", () => {
    expect(parsePagination(request(""))).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(parsePagination(request("?page=3&pageSize=999"))).toEqual({ page: 3, pageSize: 100, skip: 200, take: 100 });
  });

  it("rejects invalid numeric input without producing unstable offsets", () => {
    expect(parsePagination(request("?page=-1&pageSize=0"))).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(parsePagination(request("?page=1.2&pageSize=2.5"))).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });
});
