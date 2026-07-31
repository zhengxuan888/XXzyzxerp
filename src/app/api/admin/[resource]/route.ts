import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { ADMIN_RESOURCE_MAP, type AdminResource } from "@/lib/admin-rules";
import { requireAuthContext } from "@/lib/api-auth";
import { assertGrantRule, type PermissionScope, checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSystemConfigurationPermission } from "@/lib/system-configuration";

type RouteParams = {
  params: Promise<{ resource: string }>;
};

type JsonBody = Record<string, unknown>;

function isSupportedResource(resource: string): resource is AdminResource {
  return (Object.keys(ADMIN_RESOURCE_MAP) as string[]).includes(resource);
}

function buildResponseNotFound() {
  return NextResponse.json({ error: "Resource not found." }, { status: 404 });
}

function invalidBody(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function getParams(ctx: RouteParams) {
  return (await ctx.params).resource;
}

function parsePermissionScope(value: unknown): PermissionScope {
  if (typeof value !== "string") return "DEPARTMENT";
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "ALL" ||
    normalized === "BUSINESS_UNIT" ||
    normalized === "DEPARTMENT" ||
    normalized === "SITE" ||
    normalized === "SELF" ||
    normalized === "NONE"
  ) {
    return normalized;
  }
  return "DEPARTMENT";
}

export async function GET(_request: NextRequest, props: RouteParams) {
  const resource = await getParams(props);
  const auth = await requireAuthContext(_request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  if (!isSupportedResource(resource)) return buildResponseNotFound();
  const config = ADMIN_RESOURCE_MAP[resource];

  const canRead = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: config.readAction,
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
  });
  if (!canRead.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canRead.reasons }, { status: 403 });
  }

  // ALL is a record scope inside the currently selected business context. It
  // must never be reinterpreted as a cross-business-unit list permission.
  // Shared registries have a separate, explicit system configuration action.
  const systemConfiguration = await getSystemConfigurationPermission(auth);

  if (resource === "legal-entities") {
    const entities = await prisma.legalEntity.findMany({
      where: systemConfiguration.allowed ? {} : { id: auth.membership.legalEntityId },
      orderBy: { createdAt: "desc" },
      include: {
        businessUnits: systemConfiguration.allowed
          ? true
          : { where: { id: auth.membership.businessUnitId } },
      },
    });
    return NextResponse.json(entities);
  }

  if (resource === "business-units") {
    const rows = await prisma.businessUnit.findMany({
      where: { isActive: true, id: auth.membership.businessUnitId },
      orderBy: { createdAt: "desc" },
      include: { legalEntity: true },
    });
    return NextResponse.json(rows);
  }

  if (resource === "departments") {
    const rows = await prisma.department.findMany({
      where: {
        isActive: true,
        businessUnitId: auth.membership.businessUnitId,
      },
      include: { businessUnit: true, parent: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rows);
  }

  if (resource === "sites") {
    const rows = await prisma.site.findMany({
      where: {
        isActive: true,
        businessUnitId: auth.membership.businessUnitId,
      },
      include: { businessUnit: true, department: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rows);
  }

  if (resource === "users") {
    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        memberships: { some: { businessUnitId: auth.membership.businessUnitId, isActive: true } },
      },
      orderBy: { createdAt: "desc" },
      include: { memberships: { where: { isActive: true }, include: { businessUnit: true, role: true, department: true } } },
    });
    return NextResponse.json(rows);
  }

  if (resource === "memberships") {
    const rows = await prisma.membership.findMany({
      where: {
        isActive: true,
        businessUnitId: auth.membership.businessUnitId,
      },
      orderBy: { createdAt: "desc" },
      include: { user: true, role: true, businessUnit: true, department: true, site: true },
    });
    return NextResponse.json(rows);
  }

  if (resource === "roles") {
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    const rows = await prisma.role.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        rolePermissions: {
          include: { action: true },
        },
      },
    });
    return NextResponse.json(rows);
  }

  if (resource === "menus") {
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    const rows = await prisma.menu.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { parent: true, requiredAction: true },
    });
    return NextResponse.json(rows);
  }

  if (resource === "access-grants") {
    const rows = await prisma.accessGrant.findMany({
      where: {
        businessUnitId: auth.membership.businessUnitId,
      },
      include: {
        granteeMembership: {
          include: { user: true, businessUnit: true },
        },
        granterMembership: { include: { user: true } },
        action: true,
      },
      orderBy: { grantedAt: "desc" },
    });
    return NextResponse.json(rows);
  }

  return buildResponseNotFound();
}

export async function POST(request: NextRequest, props: RouteParams) {
  const resource = await getParams(props);
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!isSupportedResource(resource)) return buildResponseNotFound();
  const config = ADMIN_RESOURCE_MAP[resource];

  const canWrite = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: config.writeAction,
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
  });
  if (!canWrite.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: canWrite.reasons }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as JsonBody | null;
  if (!body || typeof body !== "object") {
    return invalidBody("Body must be JSON object.");
  }

  if (resource === "legal-entities") {
    const systemConfiguration = await getSystemConfigurationPermission(auth);
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    if (typeof body.code !== "string" || typeof body.name !== "string") {
      return invalidBody("legal entity code and name are required.");
    }
    const entity = await prisma.legalEntity.create({
      data: { code: body.code, name: body.name },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.legal-entities",
      action: "legal_entity.create",
      targetType: "legal_entity",
      targetId: entity.id,
      businessUnitId: null,
      roleId: auth.membership.roleId,
      details: { resource: "legal-entities", payload: body },
    });
    return NextResponse.json(entity);
  }

  if (resource === "business-units") {
    const systemConfiguration = await getSystemConfigurationPermission(auth);
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    if (typeof body.code !== "string" || typeof body.name !== "string" || typeof body.legalEntityId !== "string") {
      return invalidBody("business unit code, name and legalEntityId are required.");
    }
    const row = await prisma.businessUnit.create({
      data: {
        legalEntityId: body.legalEntityId,
        code: body.code,
        name: body.name,
        isActive: body.isActive !== false,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.business-units",
      action: "business_unit.create",
      targetType: "business_unit",
      targetId: row.id,
      businessUnitId: row.id,
      roleId: auth.membership.roleId,
      details: { resource: "business-units", payload: body },
    });
    return NextResponse.json(row);
  }

  if (resource === "departments") {
    if (typeof body.code !== "string" || typeof body.name !== "string" || typeof body.businessUnitId !== "string") {
      return invalidBody("department code, name and businessUnitId are required.");
    }
    const targetPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: config.writeAction,
      targetBusinessUnitId: body.businessUnitId,
      targetDepartmentId: typeof body.parentId === "string" ? body.parentId : auth.membership.departmentId,
    });
    if (!targetPermission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: targetPermission.reasons }, { status: 403 });
    const parent =
      typeof body.parentId === "string" && body.parentId
        ? await prisma.department.findFirst({ where: { id: body.parentId, businessUnitId: body.businessUnitId } })
        : null;
    if (body.parentId && !parent) return invalidBody("parent department is outside target business unit.");
    const row = await prisma.department.create({
      data: {
        businessUnitId: body.businessUnitId,
        code: body.code,
        name: body.name,
        parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        hierarchyPath: typeof body.hierarchyPath === "string" ? body.hierarchyPath : null,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.departments",
      action: "department.create",
      targetType: "department",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { resource: "departments", payload: body },
    });
    return NextResponse.json(row);
  }

  if (resource === "sites") {
    if (typeof body.code !== "string" || typeof body.name !== "string" || typeof body.businessUnitId !== "string") {
      return invalidBody("site code, name and businessUnitId are required.");
    }
    const targetPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: config.writeAction,
      targetBusinessUnitId: body.businessUnitId,
      targetDepartmentId: typeof body.departmentId === "string" ? body.departmentId : auth.membership.departmentId,
    });
    if (!targetPermission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: targetPermission.reasons }, { status: 403 });
    const department =
      typeof body.departmentId === "string" && body.departmentId
        ? await prisma.department.findFirst({ where: { id: body.departmentId, businessUnitId: body.businessUnitId } })
        : null;
    if (body.departmentId && !department) return invalidBody("department is outside target business unit.");
    const row = await prisma.site.create({
      data: {
        code: body.code,
        name: body.name,
        businessUnitId: body.businessUnitId,
        departmentId: typeof body.departmentId === "string" && body.departmentId ? body.departmentId : null,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.sites",
      action: "site.create",
      targetType: "site",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { resource: "sites", payload: body },
    });
    return NextResponse.json(row);
  }

  if (resource === "users") {
    if (typeof body.username !== "string" || typeof body.email !== "string" || typeof body.fullName !== "string") {
      return invalidBody("username, email and fullName are required.");
    }
    const hash = typeof body.password === "string" ? await bcrypt.hash(body.password, 10) : undefined;
    const row = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        fullName: body.fullName,
        passwordHash: hash,
        isActive: body.isActive !== false,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.users",
      action: "user.create",
      targetType: "user",
      targetId: row.id,
      roleId: auth.membership.roleId,
      details: { resource: "users", payload: { username: body.username, email: body.email } },
    });
    return NextResponse.json(row);
  }

  if (resource === "memberships") {
    if (
      typeof body.userId !== "string" ||
      typeof body.businessUnitId !== "string" ||
      typeof body.roleId !== "string" ||
      typeof body.legalEntityId !== "string"
    ) {
      return invalidBody("userId, legalEntityId, businessUnitId and roleId are required.");
    }
    const [businessUnit, department, site, managerMembership, rolePermissions] = await Promise.all([
      prisma.businessUnit.findFirst({ where: { id: body.businessUnitId, legalEntityId: body.legalEntityId, isActive: true } }),
      typeof body.departmentId === "string" && body.departmentId
        ? prisma.department.findFirst({ where: { id: body.departmentId, businessUnitId: body.businessUnitId, isActive: true } })
        : null,
      typeof body.siteId === "string" && body.siteId
        ? prisma.site.findFirst({ where: { id: body.siteId, businessUnitId: body.businessUnitId, isActive: true } })
        : null,
      typeof body.managerMembershipId === "string" && body.managerMembershipId
        ? prisma.membership.findFirst({ where: { id: body.managerMembershipId, businessUnitId: body.businessUnitId, isActive: true } })
        : null,
      prisma.rolePermission.findMany({ where: { roleId: body.roleId, isAllowed: true } }),
    ]);
    if (!businessUnit || (body.departmentId && !department) || (body.siteId && !site) || (body.managerMembershipId && !managerMembership)) {
      return invalidBody("Membership organization references are inconsistent.");
    }
    const targetPermission = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: config.writeAction,
      targetBusinessUnitId: body.businessUnitId,
      targetDepartmentId: typeof body.departmentId === "string" ? body.departmentId : null,
      targetSiteId: typeof body.siteId === "string" ? body.siteId : null,
    });
    if (!targetPermission.allowed) return NextResponse.json({ error: "FORBIDDEN", reasons: targetPermission.reasons }, { status: 403 });
    for (const permission of rolePermissions) {
      const delegation = await assertGrantRule({
        actorMembershipId: auth.membership.id,
        actorUserId: auth.userId,
        actionKey: permission.actionKey,
        requestedScope: parsePermissionScope(permission.scope),
        target: {
          businessUnitId: body.businessUnitId,
          departmentId: typeof body.departmentId === "string" ? body.departmentId : null,
          siteId: typeof body.siteId === "string" ? body.siteId : null,
        },
      });
      if (!delegation.allowed) {
        return NextResponse.json(
          { error: "ROLE_ASSIGNMENT_EXCEEDS_AUTHORITY", actionKey: permission.actionKey, reasons: delegation.reasons },
          { status: 403 },
        );
      }
    }
    const row = await prisma.membership.create({
      data: {
        userId: body.userId,
        legalEntityId: body.legalEntityId,
        businessUnitId: body.businessUnitId,
        departmentId: typeof body.departmentId === "string" && body.departmentId ? body.departmentId : null,
        siteId: typeof body.siteId === "string" && body.siteId ? body.siteId : null,
        managerMembershipId: typeof body.managerMembershipId === "string" && body.managerMembershipId ? body.managerMembershipId : null,
        roleId: body.roleId,
        isPrimary: body.isPrimary === true,
        scope: typeof body.scope === "string" ? body.scope : "BUSINESS_UNIT",
        isActive: body.isActive !== false,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.memberships",
      action: "membership.create",
      targetType: "membership",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { resource: "memberships", payload: body },
    });
    return NextResponse.json(row);
  }

  if (resource === "roles") {
    const systemConfiguration = await getSystemConfigurationPermission(auth);
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    if (typeof body.code !== "string" || typeof body.name !== "string") {
      return invalidBody("code and name are required.");
    }
    const requested = Array.isArray(body.permissions)
      ? body.permissions.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const value = item as Record<string, unknown>;
          const scope = parsePermissionScope(value.scope);
          return typeof value.actionKey === "string" ? [{ actionKey: value.actionKey, scope }] : [];
        })
      : (Array.isArray(body.actionKeys) ? body.actionKeys : []).flatMap((item) =>
          typeof item === "string" ? [{ actionKey: item, scope: "BUSINESS_UNIT" as PermissionScope }] : [],
        );
    if (new Set(requested.map((item) => item.actionKey)).size !== requested.length) return invalidBody("permission actions must be unique.");
    const actionCount = await prisma.action.count({ where: { key: { in: requested.map((item) => item.actionKey) } } });
    if (actionCount !== requested.length) return invalidBody("permission list contains unknown action.");
    for (const permission of requested) {
      const delegation = await assertGrantRule({
        actorMembershipId: auth.membership.id,
        actorUserId: auth.userId,
        actionKey: permission.actionKey,
        requestedScope: permission.scope,
        target: {
          businessUnitId: auth.membership.businessUnitId,
          departmentId: auth.membership.departmentId,
          siteId: auth.membership.siteId,
        },
      });
      if (!delegation.allowed) {
        return NextResponse.json(
          { error: "ROLE_PERMISSION_EXCEEDS_AUTHORITY", actionKey: permission.actionKey, reasons: delegation.reasons },
          { status: 403 },
        );
      }
    }
    const code = body.code.trim();
    const name = body.name.trim();
    if (!code || !name) return invalidBody("code and name cannot be empty.");
    if (await prisma.role.findUnique({ where: { code }, select: { id: true } })) return invalidBody("role code already exists.");
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { code, name, description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null },
      });
      if (requested.length) {
        await tx.rolePermission.createMany({
          data: requested.map((permission) => ({ roleId: created.id, actionKey: permission.actionKey, scope: permission.scope, isAllowed: true })),
        });
      }
      const selected = new Set(requested.map((permission) => permission.actionKey));
      const menus = await tx.menu.findMany({ select: { id: true, requiredActionKey: true } });
      if (menus.length) {
        await tx.menuPermission.createMany({
          data: menus.map((menu) => ({
            menuId: menu.id,
            roleId: created.id,
            isEnabled: Boolean(menu.requiredActionKey && selected.has(menu.requiredActionKey)),
          })),
        });
      }
      return created;
    });

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.roles",
      action: "role.create",
      targetType: "role",
      targetId: row.id,
      roleId: auth.membership.roleId,
      details: { resource: "roles", payload: { code, name, permissions: requested } },
    });
    return NextResponse.json(row);
  }

  if (resource === "menus") {
    const systemConfiguration = await getSystemConfigurationPermission(auth);
    if (!systemConfiguration.allowed) {
      return NextResponse.json({ error: "FORBIDDEN", reasons: systemConfiguration.reasons }, { status: 403 });
    }
    if (typeof body.key !== "string" || typeof body.label !== "string" || typeof body.path !== "string") {
      return invalidBody("key,label,path are required.");
    }
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    const requiredActionKey = typeof body.requiredActionKey === "string" && body.requiredActionKey ? body.requiredActionKey : null;
    const [duplicate, parent, requiredAction] = await Promise.all([
      prisma.menu.findUnique({ where: { key: body.key.trim() }, select: { id: true } }),
      parentId ? prisma.menu.findUnique({ where: { id: parentId }, select: { id: true } }) : null,
      requiredActionKey ? prisma.action.findUnique({ where: { key: requiredActionKey }, select: { key: true } }) : null,
    ]);
    if (duplicate) return invalidBody("menu key already exists.");
    if (parentId && !parent) return invalidBody("parent menu does not exist.");
    if (requiredActionKey && !requiredAction) return invalidBody("required action does not exist.");
    const row = await prisma.menu.create({
      data: {
        key: body.key.trim(),
        label: body.label.trim(),
        path: body.path.trim(),
        parentId,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        icon: typeof body.icon === "string" ? body.icon : null,
        requiredActionKey,
        isActive: body.isActive !== false,
      },
    });
    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.menus",
      action: "menu.create",
      targetType: "menu",
      targetId: row.id,
      businessUnitId: null,
      roleId: auth.membership.roleId,
      details: { resource: "menus", payload: body },
    });
    return NextResponse.json(row);
  }

  if (resource === "access-grants") {
    if (
      typeof body.granteeMembershipId !== "string" ||
      typeof body.actionKey !== "string" ||
      typeof body.businessUnitId !== "string" ||
      typeof body.reason !== "string"
    ) {
      return invalidBody("granteeMembershipId, actionKey, businessUnitId and reason are required.");
    }

    const requestedScope = parsePermissionScope(body.scope);
    const [grantee, department, site] = await Promise.all([
      prisma.membership.findFirst({
      where: { id: body.granteeMembershipId, isActive: true, OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }] },
      }),
      typeof body.departmentId === "string" && body.departmentId
        ? prisma.department.findFirst({ where: { id: body.departmentId, businessUnitId: body.businessUnitId, isActive: true } })
        : null,
      typeof body.siteId === "string" && body.siteId
        ? prisma.site.findFirst({ where: { id: body.siteId, businessUnitId: body.businessUnitId, isActive: true } })
        : null,
    ]);
    if (!grantee || grantee.businessUnitId !== body.businessUnitId) return invalidBody("grantee membership is not active in target business unit.");
    if ((body.departmentId && !department) || (body.siteId && !site)) return invalidBody("grant department or site is outside target business unit.");
    let expiresAt: Date | null = null;
    if (typeof body.expiresAt === "string") {
      expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return invalidBody("expiresAt must be a valid future time.");
    }
    const canDelegate = await assertGrantRule({
      actorMembershipId: auth.membership.id,
      actorUserId: auth.userId,
      actionKey: body.actionKey,
      requestedScope,
      target: {
        businessUnitId: body.businessUnitId,
        departmentId: typeof body.departmentId === "string" ? body.departmentId : null,
        siteId: typeof body.siteId === "string" ? body.siteId : null,
      },
    });
    if (!canDelegate.allowed) {
      return NextResponse.json({ error: "Grant denied", reasons: canDelegate.reasons }, { status: 403 });
    }

    const row = await prisma.accessGrant.create({
      data: {
        granteeMembershipId: body.granteeMembershipId,
        granterMembershipId: auth.membership.id,
        actionKey: body.actionKey,
        scope: requestedScope,
        reason: body.reason,
        businessUnitId: body.businessUnitId,
        departmentId: typeof body.departmentId === "string" ? body.departmentId : null,
        siteId: typeof body.siteId === "string" ? body.siteId : null,
        expiresAt,
      },
    });

    await writeAuditLog({
      actorUserId: auth.userId,
      actorMembershipId: auth.membership.id,
      module: "admin.access-grants",
      action: "access_grant.create",
      targetType: "access_grant",
      targetId: row.id,
      businessUnitId: row.businessUnitId,
      roleId: auth.membership.roleId,
      details: { resource: "access-grants", payload: { actionKey: body.actionKey, granteeMembershipId: body.granteeMembershipId } },
    });
    return NextResponse.json(row);
  }

  return buildResponseNotFound();
}
