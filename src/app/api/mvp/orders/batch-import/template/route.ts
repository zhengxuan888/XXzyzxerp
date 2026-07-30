import ExcelJS from "exceljs";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";

export const runtime = "nodejs";

const HEADERS = [
  "订单号",
  "店铺ID",
  "客户姓名",
  "电话",
  "邮箱",
  "收货地址",
  "国家",
  "城市",
  "邮编",
  "商品编码",
  "数量",
  "单价分",
  "COD金额分",
  "币种",
  "付款方式",
];

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有批量录入订单权限。", 403);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "择优臻选 ERP";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("订单导入");
  sheet.addRow(HEADERS);
  sheet.addRow([
    "",
    "示例店铺",
    "示例客户（请删除本行）",
    "+34123456789",
    "customer@example.com",
    "示例地址",
    "ES",
    "Madrid",
    "28001",
    "请填写系统中的商品编码",
    1,
    2999,
    2999,
    "EUR",
    "COD",
  ]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "O1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB88927" },
  };
  sheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 22 },
    { width: 18 },
    { width: 28 },
    { width: 36 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 28 },
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 10 },
    { width: 14 },
  ];

  const output = await workbook.xlsx.writeBuffer();
  return new Response(output as BodyInit, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''order-import-template.xlsx",
    },
  });
}
