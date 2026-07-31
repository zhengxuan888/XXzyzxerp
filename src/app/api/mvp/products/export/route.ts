import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_EXPORT_PRODUCTS = 20_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "product.export",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有导出商品与 SKU 的权限。", 403);

  const total = await prisma.product.count({ where: { businessUnitId: auth.membership.businessUnitId } });
  if (total > MAX_EXPORT_PRODUCTS) {
    return fail("EXPORT_LIMIT", `当前范围有 ${total} 个商品，超过单次 ${MAX_EXPORT_PRODUCTS} 个的安全导出上限。请先缩小范围或使用后续批量导出任务。`, 409);
  }
  const products = await prisma.product.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    include: { skus: { orderBy: [{ code: "asc" }, { id: "asc" }] } },
    orderBy: [{ code: "asc" }, { id: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ZC ERP";
  const sheet = workbook.addWorksheet("商品SKU导出");
  sheet.columns = [
    { header: "商品编码", key: "productCode", width: 22 },
    { header: "商品名称", key: "productName", width: 26 },
    { header: "分类", key: "category", width: 16 },
    { header: "单位", key: "unit", width: 12 },
    { header: "SKU编码", key: "skuCode", width: 22 },
    { header: "条形码", key: "barcode", width: 22 },
    { header: "状态", key: "status", width: 12 },
    { header: "商品描述", key: "description", width: 34 },
  ];
  products.forEach((product) => {
    const rows = product.skus.length ? product.skus : [null];
    rows.forEach((sku) => {
      sheet.addRow({
        productCode: product.code,
        productName: product.name,
        category: product.category ?? "",
        unit: product.unit ?? "",
        skuCode: sku?.code ?? "",
        barcode: sku?.barcode ?? "",
        status: product.isActive && (sku?.isActive ?? true) ? "启用" : "停用",
        description: product.description ?? "",
      });
    });
  });
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "H1" };

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.products",
    action: "product.export",
    targetType: "product_catalog",
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { productCount: products.length },
  });

  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''product-sku-export.xlsx",
      "Cache-Control": "private, no-store",
    },
  });
}
