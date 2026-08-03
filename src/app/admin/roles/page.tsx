import { redirect } from "next/navigation";

import RolePermissionManager from "@/components/admin/RolePermissionManager";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getRoleTemplateManagementPermission } from "@/lib/role-template-management";

export default async function RolesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canManageTemplates] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "role.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    getRoleTemplateManagementPermission({ userId: session.userId, membership }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, actions] = await Promise.all([
    prisma.role.findMany({ where: { code: { not: "legacy_fulfillment" } }, orderBy: { createdAt: "desc" }, include: { rolePermissions: { where: { isAllowed: true } } } }),
    prisma.action.findMany({ orderBy: [{ namespace: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <RolePermissionManager
      canCreate={canManageTemplates.allowed}
      canUpdate={canManageTemplates.allowed}
      roles={rows.map((role) => ({ id: role.id, code: role.code, name: role.name, description: role.description, isSystem: role.isSystem, permissions: role.rolePermissions.map((permission) => ({ actionKey: permission.actionKey, scope: permission.scope })) }))}
      actions={actions.map((action) => ({ key: action.key, name: action.name, namespace: action.namespace, defaultScope: "BUSINESS_UNIT" }))}
    />
  );
}
