import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function SitesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "site.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, businessUnits, departments] = await Promise.all([
    prisma.site.findMany({ orderBy: { createdAt: "desc" }, include: { businessUnit: true, department: true } }),
    prisma.businessUnit.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <CrudPage
      resource="sites"
      listTitle="Sites"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Name", required: true },
        {
          key: "businessUnitId",
          label: "Business Unit",
          type: "select",
          required: true,
          options: businessUnits.map((unit) => ({ value: unit.id, label: unit.name })),
        },
        {
          key: "departmentId",
          label: "Department (optional)",
          type: "select",
          options: departments.map((dept) => ({ value: dept.id, label: `${dept.code} - ${dept.name}` })),
        },
      ]}
      dataColumns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        {
          key: "businessUnit",
          label: "Business Unit",
          render: (row) => ((row.businessUnit as { name?: string } | undefined)?.name ?? "-"),
        },
        {
          key: "department",
          label: "Department",
          render: (row) => ((row.department as { name?: string } | undefined)?.name ?? "-"),
        },
      ]}
    />
  );
}
