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

  const [canRead, canCreate, canUpdate, canDelete] = await Promise.all([
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
      actionKey: "access_grant.update",
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

  const canSeeAll = canRead.reasons.includes("SCOPE_ALL");
  const [rows, actions, memberships, businessUnits, departments, sites] = await Promise.all([
    prisma.accessGrant.findMany({
      where: canSeeAll ? {} : { businessUnitId: membership.businessUnitId },
      orderBy: { grantedAt: "desc" },
      include: { action: true, granteeMembership: { include: { user: true, businessUnit: true, role: true } }, granterMembership: { include: { user: true } } },
    }),
    prisma.action.findMany({ orderBy: { key: "asc" } }),
    prisma.membership.findMany({
      where: { isActive: true, ...(canSeeAll ? {} : { businessUnitId: membership.businessUnitId }) },
      include: { user: true, businessUnit: true, role: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.businessUnit.findMany({ where: canSeeAll ? {} : { id: membership.businessUnitId }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: canSeeAll ? {} : { businessUnitId: membership.businessUnitId }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ where: canSeeAll ? {} : { businessUnitId: membership.businessUnitId }, orderBy: { name: "asc" } }),
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
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定撤销这条额外授权吗？撤销后菜单和 API 权限会立即失效。"
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
          label: "业务板块",
          required: true,
          type: "select",
          options: businessUnits.map((unit) => ({ value: unit.id, label: unit.name })),
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
          label: "部门（可选）",
          type: "select",
          options: departments.map((department) => ({ value: department.id, label: department.name })),
        },
        {
          key: "siteId",
          label: "站点（可选）",
          type: "select",
          options: sites.map((site) => ({ value: site.id, label: site.name })),
        },
        { key: "isActive", label: "启用授权", type: "checkbox" },
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
        { key: "expiresAt", label: "到期时间", render: (row) => row.expiresAt instanceof Date ? row.expiresAt.toLocaleString("zh-CN") : "长期有效" },
        { key: "isActive", label: "状态", render: (row) => {
          if (!row.isActive || row.revokedAt) return "已撤销";
          if (row.expiresAt instanceof Date && row.expiresAt <= new Date()) return "已到期";
          return "有效";
        } },
      ]}
    />
  );
}
