import { notFound, redirect } from "next/navigation";

import EmployeePermissionWorkspace from "@/components/admin/EmployeePermissionWorkspace";
import { getActiveMembershipById } from "@/lib/auth";
import { actionLabel } from "@/lib/permission-display";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function EmployeePermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const actor = await getActiveMembershipById(session.activeMembershipId);
  if (!actor) redirect("/login");
  const canRead = await checkPermission({ userId: session.userId, membershipId: actor.id, actionKey: "membership.read", targetBusinessUnitId: actor.businessUnitId });
  const canUpdate = await checkPermission({ userId: session.userId, membershipId: actor.id, actionKey: "membership.update", targetBusinessUnitId: actor.businessUnitId });
  if (!canRead.allowed || !canUpdate.allowed) redirect("/admin/users");
  const [user, roles] = await Promise.all([
    prisma.user.findFirst({ where: { id, memberships: { some: { businessUnitId: actor.businessUnitId } } }, include: { memberships: { where: { businessUnitId: actor.businessUnitId, isActive: true }, include: { role: true, businessUnit: true, department: true, site: true } } } }),
    prisma.role.findMany({ orderBy: { name: "asc" }, include: { rolePermissions: { where: { isAllowed: true }, orderBy: { actionKey: "asc" } } } }),
  ]);
  if (!user) notFound();
  return <EmployeePermissionWorkspace userName={user.fullName || user.username} memberships={user.memberships.map((item) => ({ id: item.id, roleId: item.roleId, businessUnitName: item.businessUnit.name, departmentName: item.department?.name ?? null, siteName: item.site?.name ?? null, scope: item.scope, isPrimary: item.isPrimary, isActive: item.isActive, departmentId: item.departmentId, siteId: item.siteId, managerMembershipId: item.managerMembershipId }))} roles={roles.map((role) => ({ id: role.id, name: role.name, description: role.description, permissions: role.rolePermissions.map((permission) => actionLabel(permission.actionKey)) }))} />;
}
