import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  CUSTOMER_IMPORT_MAX_BYTES, CUSTOMER_IMPORT_MAX_ROWS, parseCustomerImportFile, validateCustomerImportRows,
} from "@/lib/customer-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const allowed = await checkPermission({
    userId: auth.userId, membershipId: auth.membership.id, actionKey: "customer.import",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!allowed.allowed) return fail("FORBIDDEN", "没有客户导入权限。", 403);
  const form = await request.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请选择 XLSX 或 CSV 文件。", 400);
  const extension = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!extension || file.size > CUSTOMER_IMPORT_MAX_BYTES) return fail("INVALID_FILE", "仅支持 10MB 以内的 XLSX 或 CSV。", 400);
  if (mode !== "preview" && mode !== "commit") return fail("INVALID_MODE", "导入模式无效。", 400);
  let rows;
  try {
    rows = await parseCustomerImportFile(Buffer.from(await file.arrayBuffer()), extension);
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  if (!rows.length || rows.length > CUSTOMER_IMPORT_MAX_ROWS) return fail("ROW_LIMIT", `文件必须包含 1-${CUSTOMER_IMPORT_MAX_ROWS} 行客户。`, 400);
  const existing = await prisma.customer.findMany({
    where: { businessUnitId: auth.membership.businessUnitId },
    select: { code: true, contactEmail: true, contactPhone: true },
  });
  const checked = validateCustomerImportRows(
    rows,
    new Set(existing.map((item) => item.code.toLowerCase())),
    new Set(existing.flatMap((item) => item.contactEmail ? [item.contactEmail.toLowerCase()] : [])),
    new Set(existing.flatMap((item) => item.contactPhone ? [item.contactPhone.replace(/\s/g, "")] : [])),
  );
  const create = checked.filter((row) => row.action === "CREATE");
  const summary = {
    total: checked.length, create: create.length,
    skip: checked.filter((row) => row.action === "SKIP").length,
    reject: checked.filter((row) => row.action === "REJECT").length,
  };
  if (mode === "preview") return ok({ summary, rows: checked });
  if (summary.reject) return fail("VALIDATION_FAILED", "存在错误行，请修正后重新预览。", 400, { summary, rows: checked });
  try {
    await prisma.$transaction(create.map((row, index) => prisma.customer.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        departmentId: auth.membership.departmentId,
        code: row.code || `IMPORT-${Date.now()}-${index + 1}`,
        name: row.name,
        contactName: row.contactName || null,
        contactPhone: row.contactPhone || null,
        contactEmail: row.contactEmail || null,
        taxId: row.taxId || null,
        address: row.address || null,
      },
    })));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("IMPORT_CONFLICT", "导入期间发现重复客户编码，请重新预览。", 409);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.customers",
    action: "customer.import", targetType: "customer_batch", businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId, details: { fileName: file.name, imported: create.length, skipped: summary.skip },
  });
  return ok({ imported: create.length, skipped: summary.skip }, { status: 201 });
}
