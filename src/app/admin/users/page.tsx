import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function UsersPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "user.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "user.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "user.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { memberships: { include: { businessUnit: true, role: true } } },
  });

  return (
    <CrudPage
      resource="users"
      listTitle="Users"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "username", label: "Username", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "fullName", label: "Full Name", required: true },
        { key: "password", label: "Initial Password", type: "password" },
      ]}
      dataColumns={[
        { key: "username", label: "Username" },
        { key: "email", label: "Email" },
        { key: "fullName", label: "Full Name" },
        {
          key: "isActive",
          label: "Active",
          render: (row) => {
            const value = row.isActive;
            return typeof value === "boolean" ? (value ? "Yes" : "No") : "-";
          },
        },
      ]}
    />
  );
}
