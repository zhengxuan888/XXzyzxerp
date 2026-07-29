import { redirect } from "next/navigation";

import MenuManager from "@/components/admin/MenuManager";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function MenusPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canUpdate] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "menu.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "menu.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "menu.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);

  if (!canRead.allowed) redirect("/admin");

  const [rows, actions] = await Promise.all([
    prisma.menu.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }], include: { parent: true } }),
    prisma.action.findMany({ orderBy: [{ namespace: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <MenuManager
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      menus={rows.map((row) => ({ id: row.id, key: row.key, label: row.label, path: row.path, icon: row.icon, parentId: row.parentId, parentLabel: row.parent?.label ?? null, sortOrder: row.sortOrder, isActive: row.isActive, requiredActionKey: row.requiredActionKey }))}
      actionOptions={actions.map((action) => ({ value: action.key, label: `${action.key} · ${action.name}` }))}
    />
  );
}
