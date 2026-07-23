import { describe, expect, it } from "vitest";
import { canAssignToDepartment, inboxScopeWhere } from "@/lib/inbox/scope";
import { messageIdempotencyKey } from "@/lib/inbox/provider";
import { DemoInboxAdapter } from "@/lib/inbox/demo-adapter";

describe("统一收件箱隔离与幂等门禁", () => {
  it("部门 Scope 只生成当前部门查询条件", () => {
    expect(inboxScopeWhere({
      businessUnitId: "bu-a",
      departmentId: "dept-sales",
      permissionReasons: ["SCOPE_DEPARTMENT_OK"],
    })).toEqual({ businessUnitId: "bu-a", departmentId: "dept-sales" });
  });

  it("业务板块 Scope 不混入其他业务板块", () => {
    expect(inboxScopeWhere({
      businessUnitId: "bu-a",
      departmentId: "dept-sales",
      permissionReasons: ["SCOPE_BUSINESS_UNIT_OK"],
    })).toEqual({ businessUnitId: "bu-a" });
  });

  it("无跨部门权限时不能把会话分派到其他部门", () => {
    expect(canAssignToDepartment("dept-sales", "dept-service", ["SCOPE_DEPARTMENT_OK"])).toBe(false);
    expect(canAssignToDepartment("dept-sales", "dept-sales", ["SCOPE_DEPARTMENT_OK"])).toBe(true);
  });

  it("相同第三方消息产生稳定幂等键", async () => {
    const adapter = new DemoInboxAdapter();
    const message = (await adapter.pull("8")).messages[0];
    expect(messageIdempotencyKey("connection-1", message)).toBe(messageIdempotencyKey("connection-1", message));
    expect(messageIdempotencyKey("connection-1", message)).not.toBe(messageIdempotencyKey("connection-2", message));
  });
});
