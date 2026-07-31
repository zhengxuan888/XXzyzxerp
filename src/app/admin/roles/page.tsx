import { redirect } from "next/navigation";

import RolePermissionManager from "@/components/admin/RolePermissionManager";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSystemConfigurationPermission } from "@/lib/system-configuration";

export default async function RolesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate, canManageGlobalRegistry] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "role.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "role.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "role.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    getSystemConfigurationPermission({ userId: session.userId, membership }),
  ]);
  if (!canRead.allowed || !canManageGlobalRegistry.allowed) redirect("/admin");

  const [rows, actions] = await Promise.all([
    prisma.role.findMany({ orderBy: { createdAt: "desc" }, include: { rolePermissions: { where: { isAllowed: true } } } }),
    prisma.action.findMany({ orderBy: [{ namespace: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <RolePermissionManager
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      roles={rows.map((role) => ({ id: role.id, code: role.code, name: role.name, description: role.description, isSystem: role.isSystem, permissions: role.rolePermissions.map((permission) => ({ actionKey: permission.actionKey, scope: permission.scope })) }))}
      actions={actions.map((action) => ({ key: action.key, name: action.name, namespace: action.namespace, defaultScope: "BUSINESS_UNIT" }))}
    />
  );
}
