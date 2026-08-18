import { describe, expect, it } from "vitest";

import { parseColumnLines, parseLogisticsTemplateConfiguration } from "@/lib/logistics-provider-template";

describe("logistics provider template", () => {
  it("keeps configured column order and labels", () => {
    const result = parseLogisticsTemplateConfiguration({
      sheetName: "鸿亚订单",
      columns: [
        { field: "orderNo", header: "客户单号" },
        { field: "recipientName", header: "收件人" },
      ],
    });
    expect(result.columns.map((column) => column.header)).toEqual(["客户单号", "收件人"]);
  });

  it("drops unknown fields from editable line configuration", () => {
    expect(parseColumnLines("orderNo=订单号\nsecret=密钥\nrecipientPhone=电话")).toEqual([
      { field: "orderNo", header: "订单号" },
      { field: "recipientPhone", header: "电话" },
    ]);
  });

  it("supports fixed provider values and country-specific routes", () => {
    const result = parseLogisticsTemplateConfiguration({
      columns: [
        { field: "shippingRoute", header: "运输方式" },
        { field: "constant:1", header: "包裹件数" },
      ],
      countryRoutes: { pt: "R葡萄牙COD专线(代发)", invalid: "忽略" },
      headerFill: "#FFFF00",
    });
    expect(result.countryRoutes).toEqual({ PT: "R葡萄牙COD专线(代发)" });
    expect(result.headerFill).toBe("FFFF00");
    expect(result.columns[1]).toEqual({ field: "constant:1", header: "包裹件数" });
  });

  it("accepts independently mapped district, street and house-number columns", () => {
    expect(parseColumnLines([
      "recipientDistrict=收件人区/县",
      "recipientStreet=收件人街道",
      "recipientHouseNumber=收件人门牌号",
      "recipientAddress=收件人详细地址",
      "recipientFullAddress=完整原始地址",
    ].join("\n"))).toEqual([
      { field: "recipientDistrict", header: "收件人区/县" },
      { field: "recipientStreet", header: "收件人街道" },
      { field: "recipientHouseNumber", header: "收件人门牌号" },
      { field: "recipientAddress", header: "收件人详细地址" },
      { field: "recipientFullAddress", header: "完整原始地址" },
    ]);
  });

  it("accepts the frozen order declaration total as a core export field", () => {
    expect(parseColumnLines("declaredAmount=申报金额")).toEqual([
      { field: "declaredAmount", header: "申报金额" },
    ]);
  });
});
