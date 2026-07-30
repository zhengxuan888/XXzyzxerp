import { describe, expect, it } from "vitest";
import { parseEmployeeImportFile, validateEmployeeImportRows } from "@/lib/employee-import";
describe("employee import", () => {
  it("recognizes Chinese headers", async () => {
    const [row] = await parseEmployeeImportFile(Buffer.from("账户名,姓名,邮箱,部门编码,角色编码\nzhangsan,张三,zs@example.com,SALES,STAFF"), "csv");
    expect(row).toEqual(expect.objectContaining({ username: "zhangsan", fullName: "张三", departmentCode: "SALES" }));
  });
  it("rejects unknown organization references", () => {
    const [row] = validateEmployeeImportRows(
      [{ row: 2, username: "u", fullName: "员工", email: "u@example.com", departmentCode: "NONE", roleCode: "NONE", siteCode: "", managerUsername: "" }],
      new Set(), new Set(), new Map(), new Map(), new Map(), new Map(),
    );
    expect(row.action).toBe("REJECT");
    expect(row.errors).toContain("部门不存在或不在授权范围");
  });
});
