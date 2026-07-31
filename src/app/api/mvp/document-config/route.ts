import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

function trimText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function categoryCode(value: unknown) {
  const requested = trimText(value, 64).toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return requested || `DOC_${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

async function authorize(request: NextRequest, actionKey: "document.read" | "document.category.configure") {
  const auth = await requireAuthContext(request);
  if (!auth) return { response: fail("UNAUTHENTICATED", "请先登录。", 401) };
  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    ...(actionKey === "document.category.configure"
      ? { allowedScopes: ["ALL", "BUSINESS_UNIT"] as const }
      : {}),
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetUserId: auth.userId,
  });
  if (!decision.allowed) return { response: fail("FORBIDDEN", "没有文档分类配置权限。", 403, decision.reasons) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const access = await authorize(request, "document.read");
  if ("response" in access) return access.response;
  const categories = await prisma.documentCategory.findMany({
    where: { businessUnitId: access.auth.membership.businessUnitId },
    select: { id: true, code: true, name: true, description: true, sortOrder: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  return ok(categories);
}

export async function POST(request: NextRequest) {
  const access = await authorize(request, "document.category.configure");
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = trimText(body?.name, 80);
  const code = categoryCode(body?.code);
  const description = trimText(body?.description, 400) || null;
  const sortOrderInput = Number(body?.sortOrder ?? 0);
  const sortOrder = Number.isSafeInteger(sortOrderInput) ? Math.max(-10_000, Math.min(10_000, sortOrderInput)) : 0;
  if (!name) return fail("CATEGORY_NAME_REQUIRED", "请填写分类名称。", 400);
  try {
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.documentCategory.create({
        data: {
          legalEntityId: access.auth.membership.legalEntityId,
          businessUnitId: access.auth.membership.businessUnitId,
          code,
          name,
          description,
          sortOrder,
        },
      });
      await writeAuditLog(
        {
          actorUserId: access.auth.userId,
          actorMembershipId: access.auth.membership.id,
          module: "mvp.documents",
          action: "document.category.create",
          targetType: "document_category",
          targetId: created.id,
          businessUnitId: created.businessUnitId,
          roleId: access.auth.membership.roleId,
          details: { code: created.code, name: created.name },
        },
        tx,
      );
      return created;
    });
    return ok(category, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return fail("CATEGORY_CODE_CONFLICT", "分类编码已存在，请更换后重试。", 409);
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  const access = await authorize(request, "document.category.configure");
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = trimText(body?.id, 80);
  if (!id) return fail("CATEGORY_ID_REQUIRED", "缺少要修改的文档分类。", 400);
  const current = await prisma.documentCategory.findFirst({
    where: { id, businessUnitId: access.auth.membership.businessUnitId },
  });
  if (!current) return fail("DOCUMENT_CATEGORY_NOT_FOUND", "文档分类不存在。", 404);

  const name = body && Object.hasOwn(body, "name") ? trimText(body.name, 80) : current.name;
  const code = body && Object.hasOwn(body, "code") ? categoryCode(body.code) : current.code;
  const description = body && Object.hasOwn(body, "description") ? trimText(body.description, 400) || null : current.description;
  const rawSortOrder = body && Object.hasOwn(body, "sortOrder") ? Number(body.sortOrder) : current.sortOrder;
  const sortOrder = Number.isSafeInteger(rawSortOrder) ? Math.max(-10_000, Math.min(10_000, rawSortOrder)) : current.sortOrder;
  const isActive = body && Object.hasOwn(body, "isActive") ? body.isActive === true : current.isActive;
  if (!name) return fail("CATEGORY_NAME_REQUIRED", "分类名称不能为空。", 400);

  try {
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.documentCategory.update({ where: { id: current.id }, data: { name, code, description, sortOrder, isActive } });
      await writeAuditLog(
        {
          actorUserId: access.auth.userId,
          actorMembershipId: access.auth.membership.id,
          module: "mvp.documents",
          action: "document.category.update",
          targetType: "document_category",
          targetId: updated.id,
          businessUnitId: updated.businessUnitId,
          roleId: access.auth.membership.roleId,
          details: { code: updated.code, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
    return ok(category);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return fail("CATEGORY_CODE_CONFLICT", "分类编码已存在，请更换后重试。", 409);
    throw error;
  }
}
