import { describe, expect, it } from "vitest";
import { actionLabel, scopeLabel } from "@/lib/permission-display";

describe("权限中文显示", () => {
  it("将动作标识转换为管理员可理解的中文", () => {
    expect(actionLabel("access_grant.create")).toBe("新增临时授权");
    expect(actionLabel("product.export")).toBe("导出产品");
    expect(actionLabel("shipment.timeline.view")).toBe("查看物流轨迹");
  });

  it("将数据范围转换为中文", () => {
    expect(scopeLabel("BUSINESS_UNIT")).toBe("业务板块");
    expect(scopeLabel("DEPARTMENT")).toBe("本部门");
  });
});
