import { describe, expect, it } from "vitest";

import {
  parseDateOrNull,
  resourceAssetInputSchema,
  resourceConfigPatchSchema,
  resolveResourceTransition,
  safeResourceAuditDetails,
} from "../resource-input";

const ids = {
  category: "00000000-0000-4000-8000-000000000001",
  status: "00000000-0000-4000-8000-000000000002",
};

describe("资源中心输入与流转约束", () => {
  it("只接受白名单字段，阻止把密码或 Token 当作资源资料写入", () => {
    const result = resourceAssetInputSchema.safeParse({
      name: "本地演示软件",
      categoryId: ids.category,
      statusId: ids.status,
      quantity: 1,
      password: "should-never-be-persisted",
    });

    expect(result.success).toBe(false);
  });

  it("审计摘要不会包含软件账号标识或任何凭据内容", () => {
    const input = resourceAssetInputSchema.parse({
      name: "协作软件",
      categoryId: ids.category,
      statusId: ids.status,
      quantity: 1,
      software: {
        platform: "Demo Platform",
        accountIdentifier: "finance-admin@example.test",
        licenseType: "团队版",
        seatsTotal: 10,
        seatsUsed: 3,
      },
    });

    const audit = JSON.stringify(safeResourceAuditDetails(input));
    expect(audit).not.toContain("finance-admin@example.test");
    expect(audit).toContain('"hasSoftwareProfile":true');
  });

  it("拒绝无效日期，并允许空日期表示未设置", () => {
    expect(parseDateOrNull(null, "到期")).toBeNull();
    expect(() => parseDateOrNull("not-a-date", "到期")).toThrow("到期日期格式不正确");
  });

  it("流转动作绝不产生负库存或超过总数量", () => {
    expect(() => resolveResourceTransition({
      currentStatusId: "stock",
      action: { fromStatusId: "stock", toStatusId: "in-use", availableQuantityDelta: -2, archiveAsset: false },
      availableQuantity: 1,
      quantity: 1,
    })).toThrow("不能造成负库存");

    expect(resolveResourceTransition({
      currentStatusId: "stock",
      action: { fromStatusId: "stock", toStatusId: "in-use", availableQuantityDelta: -1, archiveAsset: false },
      availableQuantity: 1,
      quantity: 1,
    })).toEqual({ statusId: "in-use", availableQuantity: 0, archiveAsset: false });
  });

  it("资源配置只允许维护可变字段，拒绝改写稳定编码或混入未知字段", () => {
    expect(resourceConfigPatchSchema.safeParse({
      kind: "lifecycleAction",
      name: "转移给新使用人",
      availableQuantityDelta: 0,
      requiresAssignee: true,
    }).success).toBe(true);

    expect(resourceConfigPatchSchema.safeParse({
      kind: "category",
      code: "REWRITTEN_CODE",
    }).success).toBe(false);

    expect(resourceConfigPatchSchema.safeParse({
      kind: "status",
      password: "must-not-be-here",
    }).success).toBe(false);
  });
});
