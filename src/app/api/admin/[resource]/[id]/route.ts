import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

async function createsReportingCycle(membershipId: string, managerMembershipId: string | null) {
  let cursor = managerMembershipId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === membershipId || visited.has(cursor)) return true;
    visited.add(cursor);
    const row = await prisma.membership.findUnique({ where: { id: cursor }, select: { managerMembershipId: true } });
    if (!row) return false;
    cursor = row.managerMembershipId;
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
      if (typeof updateBody.legalEntityId === "string" && updateBody.legalEntityId !== current.legalEntityId) {
        return invalidBody("业务板块不能直接迁移到其他公司；请使用经过审计的专用组织迁移流程。");
      }
      const legalEntityId = current.legalEntityId;
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

  if (params.resource === "users") {
    const userBody = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!userBody || typeof userBody.username !== "string" || typeof userBody.email !== "string" || typeof userBody.fullName !== "string") return invalidBody("账户名、邮箱和员工姓名为必填项。");
    const current = await prisma.user.findUnique({
      where: { id: params.id },
      include: { memberships: { where: { isActive: true }, select: { businessUnitId: true, departmentId: true, siteId: true } } },
    });
    if (!current) return buildResponseNotFound();
    const decisions = await Promise.all([...current.memberships.map((membership) => checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "user.update",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
      targetSiteId: membership.siteId,
      targetUserId: current.id,
    })), checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "user.update",
      targetBusinessUnitId: auth.membership.businessUnitId,
      targetDepartmentId: auth.membership.departmentId,
      targetUserId: current.id,
    })]);
    if (!decisions.some((decision) => decision.allowed)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const hasOtherUnit = current.memberships.some((membership) => membership.businessUnitId !== auth.membership.businessUnitId);
    if (hasOtherUnit && !decisions.some((decision) => decision.allowed && decision.reasons.includes("SCOPE_ALL"))) {
      return NextResponse.json({ error: "CROSS_UNIT_IDENTITY_REQUIRES_GLOBAL_PERMISSION" }, { status: 403 });
    }
    const username = userBody.username.trim();
    const email = userBody.email.trim().toLowerCase();
    const fullName = userBody.fullName.trim();
    if (!username || !email || !fullName) return invalidBody("账户名、邮箱和员工姓名不能为空。");
    if (await prisma.user.findFirst({ where: { id: { not: current.id }, OR: [{ username }, { email }] }, select: { id: true } })) return invalidBody("账户名或邮箱已被使用。");
    const passwordHash = typeof userBody.password === "string" && userBody.password ? await bcrypt.hash(userBody.password, 10) : current.passwordHash;
    const row = await prisma.user.update({ where: { id: current.id }, data: { username, email, fullName, passwordHash, isActive: userBody.isActive === true } });
    await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.users", action: "user.update", targetType: "user", targetId: row.id, roleId: auth.membership.roleId, details: { previous: { username: current.username, email: current.email, fullName: current.fullName, isActive: current.isActive }, next: { username, email, fullName, isActive: row.isActive }, passwordChanged: passwordHash !== current.passwordHash } });
    return NextResponse.json({ id: row.id, username: row.username, email: row.email, fullName: row.fullName, isActive: row.isActive });
  }

  if (params.resource === "memberships") {
    const membershipBody = await request.json().catch(() => null) as Record<string, unknown> | null;
    const current = await prisma.membership.findUnique({ where: { id: params.id }, include: { role: true } });
    if (!current) return buildResponseNotFound();
    if (!membershipBody || typeof membershipBody.roleId !== "string") return invalidBody("岗位角色为必填项。");
    if ((typeof membershipBody.userId === "string" && membershipBody.userId !== current.userId) ||
        (typeof membershipBody.businessUnitId === "string" && membershipBody.businessUnitId !== current.businessUnitId) ||
        (typeof membershipBody.legalEntityId === "string" && membershipBody.legalEntityId !== current.legalEntityId)) {
      return invalidBody("员工、公司和业务板块不能通过岗位编辑直接变更。");
    }
    const departmentId = typeof membershipBody.departmentId === "string" && membershipBody.departmentId ? membershipBody.departmentId : null;
    const siteId = typeof membershipBody.siteId === "string" && membershipBody.siteId ? membershipBody.siteId : null;
    const decision = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "membership.update", targetBusinessUnitId: current.businessUnitId, targetDepartmentId: departmentId ?? current.departmentId, targetSiteId: siteId ?? current.siteId, targetUserId: current.userId });
    if (!decision.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
    const [department, site, manager, rolePermissions] = await Promise.all([
      departmentId ? prisma.department.findFirst({ where: { id: departmentId, businessUnitId: current.businessUnitId, isActive: true } }) : null,
      siteId ? prisma.site.findFirst({ where: { id: siteId, businessUnitId: current.businessUnitId, isActive: true } }) : null,
      typeof membershipBody.managerMembershipId === "string" && membershipBody.managerMembershipId ? prisma.membership.findFirst({ where: { id: membershipBody.managerMembershipId, businessUnitId: current.businessUnitId, isActive: true } }) : null,
      prisma.rolePermission.findMany({ where: { roleId: membershipBody.roleId, isAllowed: true } }),
    ]);
    if ((departmentId && !department) || (siteId && !site) || (membershipBody.managerMembershipId && !manager)) return invalidBody("部门、站点或上级不属于当前业务板块。");
    if (manager?.id === current.id) return invalidBody("员工不能成为自己的直属上级。");
    if (await createsReportingCycle(current.id, manager?.id ?? null)) return invalidBody("直属上级关系会形成循环。");
    if (membershipBody.roleId !== current.roleId) {
      for (const permission of rolePermissions) {
        const delegation = await assertGrantRule({
          actorMembershipId: auth.membership.id,
          actorUserId: auth.userId,
          actionKey: permission.actionKey,
          requestedScope: normalizeScope(permission.scope),
          target: { businessUnitId: current.businessUnitId, departmentId, siteId },
        });
        if (!delegation.allowed) return NextResponse.json({ error: "ROLE_ASSIGNMENT_EXCEEDS_AUTHORITY", actionKey: permission.actionKey, reasons: delegation.reasons }, { status: 403 });
      }
    }
    const nextScope = normalizeScope(typeof membershipBody.scope === "string" ? membershipBody.scope : current.scope);
    if (nextScope === "NONE") return invalidBody("岗位数据范围无效。");
    const previous = { roleId: current.roleId, departmentId: current.departmentId, siteId: current.siteId, managerMembershipId: current.managerMembershipId, scope: current.scope, isPrimary: current.isPrimary, isActive: current.isActive };
    const row = await prisma.membership.update({
      where: { id: current.id },
      data: {
        roleId: membershipBody.roleId,
        departmentId,
        siteId,
        managerMembershipId: manager?.id ?? null,
        scope: nextScope,
        isPrimary: membershipBody.isPrimary === true,
        isActive: membershipBody.isActive === true,
        endedAt: membershipBody.isActive === true ? null : new Date(),
      },
    });
    if (row.isPrimary) await prisma.membership.updateMany({ where: { userId: row.userId, id: { not: row.id } }, data: { isPrimary: false } });
    await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.memberships", action: "membership.update", targetType: "membership", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId, details: { previous, next: { roleId: row.roleId, departmentId: row.departmentId, siteId: row.siteId, managerMembershipId: row.managerMembershipId, scope: row.scope, isPrimary: row.isPrimary, isActive: row.isActive } } });
    return NextResponse.json(row);
  }

  if (params.resource === "access-grants") {
    const grantBody = await request.json().catch(() => null) as Record<string, unknown> | null;
    const current = await prisma.accessGrant.findUnique({ where: { id: params.id } });
    if (!current) return buildResponseNotFound();
    if (!grantBody) return invalidBody("授权内容不能为空。");
    if ((typeof grantBody.granteeMembershipId === "string" && grantBody.granteeMembershipId !== current.granteeMembershipId) ||
        (typeof grantBody.actionKey === "string" && grantBody.actionKey !== current.actionKey) ||
        (typeof grantBody.businessUnitId === "string" && grantBody.businessUnitId !== current.businessUnitId)) {
      return invalidBody("员工、动作和业务板块不能直接修改；请撤销后重新授权。");
    }
    const canUpdateGrant = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "access_grant.update",
      targetBusinessUnitId: current.businessUnitId,
      targetDepartmentId: current.departmentId,
      targetSiteId: current.siteId,
    });
    if (!canUpdateGrant.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: canUpdateGrant.reasons }, { status: 403 });
    const scope = normalizeScope(typeof grantBody.scope === "string" ? grantBody.scope : current.scope);
    if (scope === "NONE") return invalidBody("授权范围无效。");
    const departmentId = typeof grantBody.departmentId === "string" && grantBody.departmentId ? grantBody.departmentId : null;
    const siteId = typeof grantBody.siteId === "string" && grantBody.siteId ? grantBody.siteId : null;
    const [department, site] = await Promise.all([
      departmentId ? prisma.department.findFirst({ where: { id: departmentId, businessUnitId: current.businessUnitId, isActive: true } }) : null,
      siteId ? prisma.site.findFirst({ where: { id: siteId, businessUnitId: current.businessUnitId, isActive: true } }) : null,
    ]);
    if ((departmentId && !department) || (siteId && !site)) return invalidBody("部门或站点不属于授权业务板块。");
    const delegation = await assertGrantRule({
      actorMembershipId: auth.membership.id,
      actorUserId: auth.userId,
      actionKey: current.actionKey,
      requestedScope: scope,
      target: { businessUnitId: current.businessUnitId, departmentId, siteId },
    });
    if (!delegation.allowed) return NextResponse.json({ error: "GRANT_EXCEEDS_AUTHORITY", reasons: delegation.reasons }, { status: 403 });
    let expiresAt = current.expiresAt;
    if (typeof grantBody.expiresAt === "string") {
      expiresAt = grantBody.expiresAt.trim() ? new Date(grantBody.expiresAt) : null;
      if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) return invalidBody("到期时间必须是未来的有效时间。");
    }
    const reason = typeof grantBody.reason === "string" ? grantBody.reason.trim() : current.reason;
    if (!reason) return invalidBody("授权原因不能为空。");
    const isActive = grantBody.isActive === true;
    const row = await prisma.accessGrant.update({
      where: { id: current.id },
      data: { scope, departmentId, siteId, reason, expiresAt, isActive, revokedAt: isActive ? null : new Date() },
    });
    await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "admin.access-grants", action: isActive ? "access_grant.update" : "access_grant.revoke", targetType: "access_grant", targetId: row.id, businessUnitId: row.businessUnitId, roleId: auth.membership.roleId, details: { previous: current, next: row } });
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
    const row = await prisma.user.update({ where: { id: params.id }, data: { isActive: false } });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.users",
      action: "user.deactivate",
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
