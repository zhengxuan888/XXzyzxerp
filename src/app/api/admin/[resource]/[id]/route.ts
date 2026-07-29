import { NextRequest, NextResponse } from "next/server";
import { ADMIN_RESOURCE_MAP, type AdminResource } from "@/lib/admin-rules";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function isSupportedResource(resource: string): resource is AdminResource {
  return (Object.keys(ADMIN_RESOURCE_MAP) as string[]).includes(resource);
}

function buildResponseNotFound() {
  return NextResponse.json({ error: "Resource not found." }, { status: 404 });
}

function invalidBody(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function createsMenuCycle(menuId: string, parentId: string | null) {
  let cursor = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === menuId || visited.has(cursor)) return true;
    visited.add(cursor);
    const parent = await prisma.menu.findUnique({ where: { id: cursor }, select: { parentId: true } });
    if (!parent) return false;
    cursor = parent.parentId;
  }
  return false;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ resource: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  if (params.resource !== "menus") return buildResponseNotFound();

  const canUpdate = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "menu.update",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!canUpdate.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canUpdate.reasons }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.key !== "string" || typeof body.label !== "string" || typeof body.path !== "string") {
    return invalidBody("菜单编码、名称和路由为必填项。");
  }
  const current = await prisma.menu.findUnique({ where: { id: params.id } });
  if (!current) return buildResponseNotFound();
  const key = body.key.trim();
  const label = body.label.trim();
  const path = body.path.trim();
  if (!key || !label || !path) return invalidBody("菜单编码、名称和路由不能为空。");
  const duplicate = await prisma.menu.findFirst({ where: { key, id: { not: params.id } }, select: { id: true } });
  if (duplicate) return invalidBody("菜单编码已存在。");
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId && !await prisma.menu.findUnique({ where: { id: parentId }, select: { id: true } })) return invalidBody("上级分类不存在。");
  if (await createsMenuCycle(params.id, parentId)) return invalidBody("上级分类会形成循环菜单树。");
  const requiredActionKey = typeof body.requiredActionKey === "string" && body.requiredActionKey ? body.requiredActionKey : null;
  if (requiredActionKey && !await prisma.action.findUnique({ where: { key: requiredActionKey }, select: { key: true } })) return invalidBody("权限动作不存在。");

  const row = await prisma.menu.update({
    where: { id: params.id },
    data: {
      key,
      label,
      path,
      icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null,
      parentId,
      requiredActionKey,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      isActive: body.isActive === true,
    },
  });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "admin.menus",
    action: "menu.update",
    targetType: "menu",
    targetId: row.id,
    roleId: auth.membership.roleId,
    details: { previous: current, next: row },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ resource: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  if (!isSupportedResource(params.resource)) return buildResponseNotFound();
  const config = ADMIN_RESOURCE_MAP[params.resource];

  const canWrite = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: config.deleteAction,
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
  });
  if (!canWrite.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canWrite.reasons }, { status: 403 });
  }

  if (params.resource === "legal-entities") {
    const row = await prisma.legalEntity.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.legal-entities",
      action: "legal_entity.delete",
      targetType: "legal_entity",
      targetId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "business-units") {
    const row = await prisma.businessUnit.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.business-units",
      action: "business_unit.delete",
      targetType: "business_unit",
      targetId: row.id,
      businessUnitId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "departments") {
    const row = await prisma.department.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.departments",
      action: "department.delete",
      targetType: "department",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "sites") {
    const row = await prisma.site.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "users") {
    const row = await prisma.user.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.users",
      action: "user.delete",
      targetType: "user",
      targetId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "memberships") {
    const target = await prisma.membership.findUnique({ where: { id: params.id } });
    if (!target) return buildResponseNotFound();
    const canDeleteTarget = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: config.deleteAction,
      targetBusinessUnitId: target.businessUnitId,
      targetDepartmentId: target.departmentId,
      targetSiteId: target.siteId,
      targetUserId: target.userId,
    });
    if (!canDeleteTarget.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: canDeleteTarget.reasons }, { status: 403 });
    }
    const row = await prisma.membership.update({
      where: { id: params.id },
      data: { isActive: false, endedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.memberships",
      action: "membership.deactivate",
      targetType: "membership",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "roles") {
    const row = await prisma.role.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.roles",
      action: "role.delete",
      targetType: "role",
      targetId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "menus") {
    const row = await prisma.menu.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "access-grants") {
    const target = await prisma.accessGrant.findUnique({ where: { id: params.id } });
    if (!target) return buildResponseNotFound();
    const canRevokeTarget = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: config.deleteAction,
      targetBusinessUnitId: target.businessUnitId,
      targetDepartmentId: target.departmentId,
      targetSiteId: target.siteId,
    });
    if (!canRevokeTarget.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: canRevokeTarget.reasons }, { status: 403 });
    }
    const row = await prisma.accessGrant.update({
      where: { id: params.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.access-grants",
      action: "access_grant.revoke",
      targetType: "access_grant",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { revoked: true },
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  return buildResponseNotFound();
}
