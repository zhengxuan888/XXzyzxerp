import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  EXPENSE_IMPORT_MAX_BYTES,
  EXPENSE_IMPORT_MAX_ROWS,
  parseExpenseImportFile,
  validateExpenseImportRows,
} from "@/lib/expense-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function expenseKey(orderNo: string, category: string, amountCents: number, paidAt: Date | null) {
  return `${orderNo}|${category.toLowerCase()}|${amountCents}|${paidAt ? paidAt.toISOString().slice(0, 10) : ""}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "expense.import",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有费用导入权限。", 403);

  const form = await request.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请选择 XLSX 或 CSV 文件。", 400);
  const extension = file.name.toLowerCase().endsWith(".xlsx")
    ? "xlsx"
    : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!extension || file.size > EXPENSE_IMPORT_MAX_BYTES) {
    return fail("INVALID_FILE", "仅支持 10MB 以内的 XLSX 或 CSV 文件。", 400);
  }
  if (mode !== "preview" && mode !== "commit") return fail("INVALID_MODE", "导入模式无效。", 400);

  let rows;
  try {
    rows = await parseExpenseImportFile(Buffer.from(await file.arrayBuffer()), extension);
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  if (!rows.length || rows.length > EXPENSE_IMPORT_MAX_ROWS) {
    return fail("ROW_LIMIT", `文件必须包含 1-${EXPENSE_IMPORT_MAX_ROWS} 行费用。`, 400);
  }

  const [orders, existing] = await Promise.all([
    prisma.order.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      select: { id: true, orderNo: true },
    }),
    prisma.expense.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
        ...(auth.membership.departmentId ? { departmentId: auth.membership.departmentId } : {}),
      },
      select: { category: true, amountCents: true, paidAt: true, order: { select: { orderNo: true } } },
    }),
  ]);
  const checked = validateExpenseImportRows(
    rows,
    new Map(orders.map((order) => [order.orderNo, order.id])),
    new Set(existing.map((expense) => expenseKey(
      expense.order?.orderNo ?? "",
      expense.category,
      expense.amountCents,
      expense.paidAt,
    ))),
  );
  const create = checked.filter((row) => row.action === "CREATE");
  const summary = {
    total: checked.length,
    create: create.length,
    skip: checked.filter((row) => row.action === "SKIP").length,
    reject: checked.filter((row) => row.action === "REJECT").length,
  };
  if (mode === "preview") return ok({ summary, rows: checked });
  if (summary.reject) {
    return fail("VALIDATION_FAILED", "存在错误行，请修正后重新预览。", 400, { summary, rows: checked });
  }

  await prisma.$transaction(create.map((row) => prisma.expense.create({
    data: {
      orderId: row.orderId ?? null,
      legalEntityId: auth.membership.legalEntityId,
      businessUnitId: auth.membership.businessUnitId,
      departmentId: auth.membership.departmentId,
      siteId: auth.membership.siteId,
      actorUserId: auth.userId,
      category: row.category,
      amountCents: row.amountCents,
      paidAt: row.paidAt ? new Date(row.paidAt) : null,
      currency: row.currency,
      note: row.note || null,
    },
  })));

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.expenses",
    action: "expense.import",
    targetType: "expense_batch",
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { fileName: file.name, imported: create.length, skipped: summary.skip },
  });
  return ok({ imported: create.length, skipped: summary.skip }, { status: 201 });
}
