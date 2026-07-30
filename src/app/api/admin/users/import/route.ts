import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  EMPLOYEE_IMPORT_MAX_BYTES,
  EMPLOYEE_IMPORT_MAX_ROWS,
  parseEmployeeImportFile,
  validateEmployeeImportRows,
} from "@/lib/employee-import";
import { assertGrantRule, checkPermission, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function permissionScope(value: string): PermissionScope {
  return ["ALL", "BUSINESS_UNIT", "DEPARTMENT", "DEPARTMENT_TREE", "SUBORDINATES", "SITE", "SELF", "NONE"].includes(value)
    ? value as PermissionScope
    : "DEPARTMENT";
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const basePermission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "user.import",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
  });
  if (!basePermission.allowed) return fail("FORBIDDEN", "没有员工导入权限。", 403);

  const form = await request.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请选择 XLSX 或 CSV 文件。", 400);
  const extension = file.name.toLowerCase().endsWith(".xlsx")
    ? "xlsx"
    : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!extension || file.size > EMPLOYEE_IMPORT_MAX_BYTES) {
    return fail("INVALID_FILE", "仅支持 5MB 以内的 XLSX 或 CSV 文件。", 400);
  }
  if (mode !== "preview" && mode !== "commit") return fail("INVALID_MODE", "导入模式无效。", 400);

  let rows;
  try {
    rows = await parseEmployeeImportFile(Buffer.from(await file.arrayBuffer()), extension);
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  if (!rows.length || rows.length > EMPLOYEE_IMPORT_MAX_ROWS) {
    return fail("ROW_LIMIT", `文件必须包含 1-${EMPLOYEE_IMPORT_MAX_ROWS} 行员工。`, 400);
  }

  const [users, departments, roles, sites, managers] = await Promise.all([
    prisma.user.findMany({ select: { username: true, email: true } }),
    prisma.department.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, code: true },
    }),
    prisma.role.findMany({ select: { id: true, code: true } }),
    prisma.site.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, code: true },
    }),
    prisma.membership.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, user: { select: { username: true } } },
    }),
  ]);
  const checked = validateEmployeeImportRows(
    rows,
    new Set(users.map((user) => user.username.toLowerCase())),
    new Set(users.map((user) => user.email.toLowerCase())),
    new Map(departments.map((item) => [item.code.toLowerCase(), item])),
    new Map(roles.map((item) => [item.code.toLowerCase(), item])),
    new Map(sites.map((item) => [item.code.toLowerCase(), item])),
    new Map(managers.map((item) => [item.user.username.toLowerCase(), item.id])),
  );

  for (const row of checked) {
    if (row.action === "REJECT" || !row.departmentId || !row.roleId) continue;
    const targetPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "membership.create",
      targetBusinessUnitId: auth.membership.businessUnitId,
      targetDepartmentId: row.departmentId,
      targetSiteId: row.siteId,
    });
    if (!targetPermission.allowed) {
      row.errors.push("没有在该部门新增员工的权限");
      row.action = "REJECT";
      continue;
    }
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: row.roleId, isAllowed: true },
      select: { actionKey: true, scope: true },
    });
    for (const permission of rolePermissions) {
      const delegation = await assertGrantRule({
        actorMembershipId: auth.membership.id,
        actorUserId: auth.userId,
        actionKey: permission.actionKey,
        requestedScope: permissionScope(permission.scope),
        target: {
          businessUnitId: auth.membership.businessUnitId,
          departmentId: row.departmentId,
          siteId: row.siteId ?? null,
        },
      });
      if (!delegation.allowed) {
        row.errors.push(`不能转授角色动作：${permission.actionKey}`);
        row.action = "REJECT";
        break;
      }
    }
  }

  const valid = checked.filter((row) => row.action === "CREATE");
  const summary = { total: checked.length, create: valid.length, reject: checked.length - valid.length };
  if (mode === "preview") return ok({ summary, rows: checked });
  if (summary.reject) {
    return fail("VALIDATION_FAILED", "存在错误或越权行，请修正后重新预览。", 400, { summary, rows: checked });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of valid) {
      const user = await tx.user.create({
        data: {
          username: row.username,
          fullName: row.fullName,
          email: row.email,
          passwordHash: null,
          isActive: false,
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          legalEntityId: auth.membership.legalEntityId,
          businessUnitId: auth.membership.businessUnitId,
          departmentId: row.departmentId!,
          siteId: row.siteId ?? null,
          roleId: row.roleId!,
          managerMembershipId: row.managerMembershipId ?? null,
          isPrimary: true,
          isActive: true,
          scope: "DEPARTMENT",
        },
      });
    }
  });

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "admin.users",
    action: "user.import",
    targetType: "employee_batch",
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { fileName: file.name, imported: valid.length, accountsActive: false },
  });
  return ok({ imported: valid.length, accountsActive: false }, { status: 201 });
}
