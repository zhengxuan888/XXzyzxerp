import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

const SCOPE_OPTIONS = [
  { value: "SITE", label: "SITE" },
  { value: "DEPARTMENT", label: "DEPARTMENT" },
  { value: "BUSINESS_UNIT", label: "BUSINESS_UNIT" },
  { value: "ALL", label: "ALL" },
];

export default async function AccessGrantsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "access_grant.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "access_grant.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "access_grant.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, actions, memberships] = await Promise.all([
    prisma.accessGrant.findMany({
      orderBy: { grantedAt: "desc" },
      include: { action: true, granteeMembership: { include: { user: true, businessUnit: true, role: true } } },
    }),
    prisma.action.findMany({ orderBy: { key: "asc" } }),
    prisma.membership.findMany({
      where: { isActive: true },
      include: { user: true, businessUnit: true, role: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const actionOptions = actions.map((action) => ({ value: action.key, label: action.key }));
  const membershipOptions = memberships.map((item) => ({
    value: item.id,
    label: `${item.user.username} | ${item.businessUnit?.name ?? "BU"} | ${item.role?.name ?? item.roleId}`,
  }));

  return (
    <CrudPage
      resource="access-grants"
      listTitle="Access Grants"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        {
          key: "granteeMembershipId",
          label: "Grantee Membership",
          type: "select",
          required: true,
          options: membershipOptions,
        },
        {
          key: "actionKey",
          label: "Action",
          type: "select",
          required: true,
          options: actionOptions,
        },
        {
          key: "businessUnitId",
          label: "Business Unit ID",
          required: true,
          type: "text",
        },
        {
          key: "scope",
          label: "Scope",
          type: "select",
          required: true,
          options: SCOPE_OPTIONS,
        },
        {
          key: "departmentId",
          label: "Department ID (optional)",
          type: "text",
        },
        {
          key: "siteId",
          label: "Site ID (optional)",
          type: "text",
        },
        {
          key: "reason",
          label: "Reason",
          required: true,
          type: "text",
        },
        {
          key: "expiresAt",
          label: "Expires At",
          type: "text",
          placeholder: "YYYY-MM-DDTHH:mm:ssZ",
        },
      ]}
      dataColumns={[
        {
          key: "granteeMembership",
          label: "Target",
          render: (row) => {
            const membership = row.granteeMembership as { user?: { username?: string } } | undefined;
            return membership?.user?.username || "-";
          },
        },
        {
          key: "action",
          label: "Action",
          render: (row) => ((row.action as { key?: string } | undefined)?.key ?? "-"),
        },
        { key: "scope", label: "Scope" },
        { key: "businessUnitId", label: "Business Unit ID" },
        { key: "reason", label: "Reason" },
      ]}
    />
  );
}
