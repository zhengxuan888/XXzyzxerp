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
