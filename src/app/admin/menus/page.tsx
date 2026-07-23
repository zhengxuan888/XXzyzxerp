import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function MenusPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
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
      actionKey: "menu.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);

  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.menu.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <CrudPage
      resource="menus"
      listTitle="Menus"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "key", label: "Menu key", required: true },
        { key: "label", label: "Label", required: true },
        { key: "path", label: "Path", required: true },
        {
          key: "requiredActionKey",
          label: "Required Action",
          type: "text",
          required: true,
        },
      ]}
      dataColumns={[
        { key: "key", label: "Key" },
        { key: "label", label: "Label" },
        { key: "path", label: "Path" },
        { key: "requiredActionKey", label: "Action" },
        { key: "sortOrder", label: "Order" },
      ]}
    />
  );
}
