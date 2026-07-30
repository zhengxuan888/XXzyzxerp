import { describe, expect, it } from "vitest";

import { parseCustomerImportFile, validateCustomerImportRows } from "@/lib/customer-import";

describe("customer import", () => {
  it("recognizes Chinese CSV columns", async () => {
    const rows = await parseCustomerImportFile(
      Buffer.from("\uFEFF客户编号,客户名称,电话,邮箱,地址\nC1,测试客户,+34123,test@example.com,Madrid"),
      "csv",
    );
    expect(rows[0]).toEqual(expect.objectContaining({ code: "C1", name: "测试客户", contactPhone: "+34123" }));
  });

  it("skips existing email and rejects invalid email", () => {
    const checked = validateCustomerImportRows([
      { row: 2, code: "", name: "已有", contactName: "", contactPhone: "", contactEmail: "old@example.com", taxId: "", address: "" },
      { row: 3, code: "C2", name: "错误", contactName: "", contactPhone: "", contactEmail: "invalid", taxId: "", address: "" },
    ], new Set(), new Set(["old@example.com"]), new Set());
    expect(checked.map((item) => item.action)).toEqual(["SKIP", "REJECT"]);
  });

  it("requires a usable identity", () => {
    const [checked] = validateCustomerImportRows([
      { row: 2, code: "", name: "无联系方式", contactName: "", contactPhone: "", contactEmail: "", taxId: "", address: "" },
    ], new Set(), new Set(), new Set());
    expect(checked.action).toBe("REJECT");
  });
});
