import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  PRODUCT_IMPORT_MAX_BYTES,
  PRODUCT_IMPORT_MAX_ROWS,
  parseProductImportFile,
  validateProductImportRows,
} from "@/lib/product-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "product.import",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有商品导入权限。", 403);

  const form = await request.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请选择 XLSX 或 CSV 文件。", 400);
  const extension = file.name.toLowerCase().endsWith(".xlsx")
    ? "xlsx"
    : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!extension || file.size > PRODUCT_IMPORT_MAX_BYTES) {
    return fail("INVALID_FILE", "仅支持 10MB 以内的 XLSX 或 CSV 文件。", 400);
  }
  if (mode !== "preview" && mode !== "commit") return fail("INVALID_MODE", "导入模式无效。", 400);

  let rows;
  try {
    rows = await parseProductImportFile(Buffer.from(await file.arrayBuffer()), extension);
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  if (!rows.length || rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    return fail("ROW_LIMIT", `文件必须包含 1-${PRODUCT_IMPORT_MAX_ROWS} 行商品。`, 400);
  }

  const [products, skus] = await Promise.all([
    prisma.product.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      select: { code: true },
    }),
    prisma.productSku.findMany({
      where: { product: { businessUnitId: auth.membership.businessUnitId } },
      select: { code: true },
    }),
  ]);
  const checked = validateProductImportRows(
    rows,
    new Set(products.map((item) => item.code.toLowerCase())),
    new Set(skus.map((item) => item.code.toLowerCase())),
  );
  const creatable = checked.filter((row) => row.action === "CREATE");
  const summary = {
    total: checked.length,
    create: creatable.length,
    skip: checked.filter((row) => row.action === "SKIP").length,
    reject: checked.filter((row) => row.action === "REJECT").length,
  };
  if (mode === "preview") return ok({ summary, rows: checked });
  if (summary.reject) return fail("VALIDATION_FAILED", "存在错误行，请修正后重新预览。", 400, { summary, rows: checked });

  try {
    await prisma.$transaction(
      creatable.map((row) => prisma.product.create({
        data: {
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          code: row.productCode,
          name: row.productName,
          category: row.category || null,
          unit: row.unit || null,
          description: row.description || null,
          skus: row.skuCode ? { create: { code: row.skuCode, barcode: row.barcode || null } } : undefined,
        },
      })),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("IMPORT_CONFLICT", "导入期间检测到重复编码，请重新预览。", 409);
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.products",
    action: "product.import",
    targetType: "product_batch",
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { fileName: file.name, imported: creatable.length, skipped: summary.skip },
  });
  return ok({ imported: creatable.length, skipped: summary.skip }, { status: 201 });
}
