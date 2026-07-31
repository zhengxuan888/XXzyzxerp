import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  PRODUCT_IMPORT_MAX_BYTES,
  PRODUCT_IMPORT_MAX_ROWS,
  analyzeProductImportFile,
  summarizeProductImportRows,
  validateProductImportRows,
} from "@/lib/product-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();

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
  const mode = text(form.get("mode")) || "preview";
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请选择 XLSX 或 CSV 文件。", 400);
  const extension = file.name.toLowerCase().endsWith(".xlsx")
    ? "xlsx"
    : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!extension || file.size > PRODUCT_IMPORT_MAX_BYTES) {
    return fail("INVALID_FILE", "仅支持 10MB 以内的 XLSX 或 CSV 文件。", 400);
  }
  if (mode !== "preview" && mode !== "commit") return fail("INVALID_MODE", "导入模式无效。", 400);

  const requestedHeaderRow = Number(text(form.get("headerRow")));
  const selection = {
    ...(text(form.get("sheetName")) ? { sheetName: text(form.get("sheetName")) } : {}),
    ...(Number.isSafeInteger(requestedHeaderRow) && requestedHeaderRow > 0
      ? { headerRow: requestedHeaderRow }
      : {}),
  };

  const input = Buffer.from(await file.arrayBuffer());
  let analysis;
  try {
    analysis = await analyzeProductImportFile(input, extension, selection);
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  const { rows, detection } = analysis;
  if (!rows.length || rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    return fail("ROW_LIMIT", `文件必须包含 1-${PRODUCT_IMPORT_MAX_ROWS} 行商品。`, 400);
  }

  const products = await prisma.product.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    select: { id: true, code: true, name: true, skus: { select: { code: true } } },
  });
  const existingProducts = new Map(products.map((item) => [item.code.trim().toLocaleLowerCase(), item]));
  const checked = validateProductImportRows(rows, existingProducts);
  const summary = summarizeProductImportRows(checked);
  if (mode === "preview") return ok({ summary, rows: checked, detection });
  if (detection.requiresSelection) {
    return fail("TEMPLATE_SELECTION_REQUIRED", "检测到多个同等匹配的工作表，请选择正确的工作表和表头行后再确认导入。", 409, { detection, rows: checked });
  }
  if (summary.reject) return fail("VALIDATION_FAILED", "存在错误行，请修正后重新预览。", 400, { summary, rows: checked });

  const grouped = new Map<string, typeof checked>();
  checked.forEach((row) => {
    const key = row.productCode.trim().toLocaleLowerCase();
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  });

  let importedProducts = 0;
  let importedSkus = 0;
  try {
    const result = await prisma.$transaction(async (tx) => {
      let productCount = 0;
      let skuCount = 0;
      for (const [productCode, group] of grouped) {
        const createProduct = group.find((row) => row.action === "CREATE_PRODUCT");
        const skuRows = group.filter((row) => row.skuCode && (row.action === "CREATE_PRODUCT" || row.action === "CREATE_SKU"));
        if (createProduct) {
          await tx.product.create({
            data: {
              legalEntityId: auth.membership.legalEntityId,
              businessUnitId: auth.membership.businessUnitId,
              code: createProduct.productCode,
              name: createProduct.productName,
              category: createProduct.category || null,
              unit: createProduct.unit || null,
              description: createProduct.description || null,
              skus: skuRows.length
                ? { create: skuRows.map((row) => ({ code: row.skuCode, barcode: row.barcode || null })) }
                : undefined,
            },
          });
          productCount += 1;
          skuCount += skuRows.length;
          continue;
        }

        const existing = existingProducts.get(productCode);
        if (!existing || skuRows.length === 0) continue;
        for (const row of skuRows) {
          await tx.productSku.create({
            data: { productId: existing.id, code: row.skuCode, barcode: row.barcode || null },
          });
          skuCount += 1;
        }
      }
      return { productCount, skuCount };
    });
    importedProducts = result.productCount;
    importedSkus = result.skuCount;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("IMPORT_CONFLICT", "导入期间检测到商品或 SKU 编码冲突；系统未写入部分数据，请重新预览后确认。", 409);
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
    details: {
      fileName: file.name,
      fileHash: createHash("sha256").update(input).digest("hex"),
      importedProducts,
      importedSkus,
      skipped: summary.skip,
      sheetName: detection.selected.sheetName,
      headerRow: detection.selected.headerRow,
      matchedFields: detection.selected.matchedFields,
    },
  });
  return ok({ importedProducts, importedSkus, skipped: summary.skip }, { status: 201 });
}
