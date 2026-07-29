import { NextRequest, NextResponse } from "next/server";
import { ADMIN_RESOURCE_MAP, type AdminResource } from "@/lib/admin-rules";
import { requireAuthContext } from "@/lib/api-auth";
import { assertGrantRule, normalizeScope, checkPermission, type PermissionScope } from "@/lib/permission";
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
  if (params.resource === "legal-entities" || params.resource === "business-units" || params.resource === "departments" || params.resource === "sites") {
    const updateBody = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!updateBody || typeof updateBody.code !== "string" || typeof updateBody.name !== "string") return invalidBody("编码和名称为必填项。");
    const code = updateBody.code.trim();
    const name = updateBody.name.trim();
    if (!code || !name) return invalidBody("编码和名称不能为空。");

    if (params.resource === "legal-entities") {
      const current = await prisma.legalEntity.findUnique({ where: { id: params.id } });
      if (!current) return buildResponseNotFound();
      const decision = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "legal_entity.update", targetBusinessUnitId: auth.membership.businessUnitId });
      if (!decision.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
      if (await prisma.legalEntity.findFirst({ where: { code, id: { not: current.id } }, select: { id: true } })) return invalidBody("公司编码已存在。");
      const row = await prisma.legalEntity.update({ where: { id: current.id }, data: { code, name, isActive: updateBody.isActive === true } });
      await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.legal-entities", action: "legal_entity.update", targetType: "legal_entity", targetId: row.id, roleId: auth.membership.roleId, details: { previous: current, next: row } });
      return NextResponse.json(row);
    }

    if (params.resource === "business-units") {
      const current = await prisma.businessUnit.findUnique({ where: { id: params.id } });
      if (!current) return buildResponseNotFound();
      const decision = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "business_unit.update", targetBusinessUnitId: current.id });
      if (!decision.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
      const legalEntityId = typeof updateBody.legalEntityId === "string" ? updateBody.legalEntityId : current.legalEntityId;
      if (!await prisma.legalEntity.findUnique({ where: { id: legalEntityId }, select: { id: true } })) return invalidBody("所属公司不存在。");
      if (await prisma.businessUnit.findFirst({ where: { legalEntityId, code, id: { not: current.id } }, select: { id: true } })) return invalidBody("该公司下业务板块编码已存在。");
      const row = await prisma.businessUnit.update({ where: { id: current.id }, data: { legalEntityId, code, name, isActive: updateBody.isActive === true } });
      await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.business-units", action: "business_unit.update", targetType: "business_unit", targetId: row.id, businessUnitId: row.id, roleId: auth.membership.roleId, details: { previous: current, next: row } });
      return NextResponse.json(row);
    }

    if (params.resource === "departments") {
      const current = await prisma.department.findUnique({ where: { id: params.id } });
      if (!current) return buildResponseNotFound();
      const decision = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "department.update", targetBusinessUnitId: current.businessUnitId, targetDepartmentId: current.id });
      if (!decision.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
      const businessUnitId = typeof updateBody.businessUnitId === "string" ? updateBody.businessUnitId : current.businessUnitId;
      if (businessUnitId !== current.businessUnitId) return invalidBody("部门不能直接移动到其他业务板块。");
      if (await prisma.department.findFirst({ where: { businessUnitId, code, parentId: current.parentId, id: { not: current.id } }, select: { id: true } })) return invalidBody("同级部门编码已存在。");
      const row = await prisma.department.update({ where: { id: current.id }, data: { code, name, isActive: updateBody.isActive === true } });
      await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.departments", action: "department.update", targetType: "department", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId, details: { previous: current, next: row } });
      return NextResponse.json(row);
    }

    const current = await prisma.site.findUnique({ where: { id: params.id } });
    if (!current) return buildResponseNotFound();
    const decision = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "site.update", targetBusinessUnitId: current.businessUnitId, targetDepartmentId: current.departmentId, targetSiteId: current.id });
    if (!decision.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
    const businessUnitId = typeof updateBody.businessUnitId === "string" ? updateBody.businessUnitId : current.businessUnitId;
    if (businessUnitId !== current.businessUnitId) return invalidBody("站点不能直接移动到其他业务板块。");
    const departmentId = typeof updateBody.departmentId === "string" && updateBody.departmentId ? updateBody.departmentId : null;
    if (departmentId && !await prisma.department.findFirst({ where: { id: departmentId, businessUnitId }, select: { id: true } })) return invalidBody("部门不属于当前业务板块。");
    if (await prisma.site.findFirst({ where: { businessUnitId, code, id: { not: current.id } }, select: { id: true } })) return invalidBody("站点编码已存在。");
    const row = await prisma.site.update({ where: { id: current.id }, data: { code, name, departmentId, isActive: updateBody.isActive === true } });
    await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.sites", action: "site.update", targetType: "site", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId, details: { previous: current, next: row } });
    return NextResponse.json(row);
  }

  if (params.resource === "roles") {
    const canUpdateRole = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "role.update",
      targetBusinessUnitId: auth.membership.businessUnitId,
    });
    if (!canUpdateRole.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canUpdateRole.reasons }, { status: 403 });
    const role = await prisma.role.findUnique({ where: { id: params.id }, include: { rolePermissions: true } });
    if (!role) return buildResponseNotFound();
    const roleBody = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!roleBody || typeof roleBody.code !== "string" || typeof roleBody.name !== "string" || !Array.isArray(roleBody.permissions)) return invalidBody("角色编码、名称和权限列表为必填项。");
    const requested = roleBody.permissions.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const scope = normalizeScope(typeof value.scope === "string" ? value.scope : null);
      return typeof value.actionKey === "string" && scope !== "NONE" ? [{ actionKey: value.actionKey, scope }] : [];
    });
    if (new Set(requested.map((item) => item.actionKey)).size !== requested.length) return invalidBody("权限动作不能重复。");
    const actionCount = await prisma.action.count({ where: { key: { in: requested.map((item) => item.actionKey) } } });
    if (actionCount !== requested.length) return invalidBody("权限列表包含不存在的动作。");
    for (const permission of requested) {
      const decision = await assertGrantRule({
        actorMembershipId: auth.membership.id,
        actorUserId: auth.userId,
        actionKey: permission.actionKey,
        requestedScope: permission.scope as PermissionScope,
        target: { businessUnitId: auth.membership.businessUnitId, departmentId: auth.membership.departmentId, siteId: auth.membership.siteId },
      });
      if (!decision.allowed) return NextResponse.json({ error: "ROLE_PERMISSION_EXCEEDS_AUTHORITY", actionKey: permission.actionKey, reasons: decision.reasons }, { status: 403 });
    }
    const code = roleBody.code.trim();
    const name = roleBody.name.trim();
    if (!code || !name) return invalidBody("角色编码和名称不能为空。");
    if (role.isSystem && code !== role.code) return invalidBody("系统角色编码不能修改。");
    const duplicate = await prisma.role.findFirst({ where: { code, id: { not: role.id } }, select: { id: true } });
    if (duplicate) return invalidBody("角色编码已存在。");
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.role.update({ where: { id: role.id }, data: { code, name, description: typeof roleBody.description === "string" && roleBody.description.trim() ? roleBody.description.trim() : null } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (requested.length) await tx.rolePermission.createMany({ data: requested.map((permission) => ({ roleId: role.id, actionKey: permission.actionKey, scope: permission.scope, isAllowed: true })) });
      const menus = await tx.menu.findMany({ select: { id: true, requiredActionKey: true } });
      const selected = new Set(requested.map((permission) => permission.actionKey));
      for (const menu of menus) {
        await tx.menuPermission.upsert({
          where: { menuId_roleId: { menuId: menu.id, roleId: role.id } },
          update: { isEnabled: Boolean(menu.requiredActionKey && selected.has(menu.requiredActionKey)) },
          create: { menuId: menu.id, roleId: role.id, isEnabled: Boolean(menu.requiredActionKey && selected.has(menu.requiredActionKey)) },
        });
      }
      return next;
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.roles",
      action: "role.update",
      targetType: "role",
      targetId: role.id,
      roleId: auth.membership.roleId,
      details: { previous: { code: role.code, name: role.name, permissions: role.rolePermissions }, next: { code: updated.code, name: updated.name, permissions: requested } },
    });
    return NextResponse.json(updated);
  }

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
    const row = await prisma.legalEntity.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.legal-entities",
      action: "legal_entity.deactivate",
      targetType: "legal_entity",
      targetId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "business-units") {
    const row = await prisma.businessUnit.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.business-units",
      action: "business_unit.deactivate",
      targetType: "business_unit",
      targetId: row.id,
      businessUnitId: row.id,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "departments") {
    const row = await prisma.department.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.departments",
      action: "department.deactivate",
      targetType: "department",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
    });
    return NextResponse.json({ ok: true, deleted: row.id });
  }

  if (params.resource === "sites") {
    const row = await prisma.site.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.sites",
      action: "site.deactivate",
      targetType: "site",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
    });
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
