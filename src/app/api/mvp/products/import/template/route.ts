import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "product.import",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有下载商品导入模板的权限。", 403);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "择优臻选 ERP";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("商品SKU导入");
  sheet.columns = [
    { header: "商品编码", key: "productCode", width: 22 },
    { header: "商品名称", key: "productName", width: 26 },
    { header: "分类", key: "category", width: 16 },
    { header: "单位", key: "unit", width: 12 },
    { header: "SKU编码", key: "skuCode", width: 22 },
    { header: "条形码", key: "barcode", width: 22 },
    { header: "商品描述", key: "description", width: 34 },
  ];
  sheet.addRow({
    productCode: "P-DEMO-001",
    productName: "示例商品（请替换）",
    category: "示例分类",
    unit: "件",
    skuCode: "SKU-DEMO-001",
    barcode: "",
    description: "同一商品的多个 SKU 可以使用相同商品编码分多行填写。",
  });
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "G1" };

  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''product-sku-import-template.xlsx",
      "Cache-Control": "private, no-store",
    },
  });
}
