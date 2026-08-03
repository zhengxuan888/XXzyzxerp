import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { actionLabel, scopeLabel } from "@/lib/permission-display";

const SCOPE_OPTIONS = [
  { value: "SITE", label: scopeLabel("SITE") },
  { value: "DEPARTMENT", label: scopeLabel("DEPARTMENT") },
  { value: "BUSINESS_UNIT", label: scopeLabel("BUSINESS_UNIT") },
  { value: "ALL", label: scopeLabel("ALL") },
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

  const actionOptions = actions.map((action) => ({ value: action.key, label: actionLabel(action.key) }));
  const membershipOptions = memberships.map((item) => ({
    value: item.id,
    label: `${item.user.username} | ${item.businessUnit?.name ?? "BU"} | ${item.role?.name ?? item.roleId}`,
  }));

  return (
    <CrudPage
      resource="access-grants"
      listTitle="临时授权"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定撤销这条额外授权吗？撤销后菜单和 API 权限会立即失效。"
      rows={rows}
      createFields={[
        {
          key: "granteeMembershipId",
          label: "授权员工",
          type: "select",
          required: true,
          options: membershipOptions,
        },
        {
          key: "actionKey",
          label: "授权动作",
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
          label: "数据范围",
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
          label: "授权原因",
          required: true,
          type: "text",
        },
        {
          key: "expiresAt",
          label: "到期时间",
          type: "datetime-local",
          placeholder: "请选择到期日期和时间",
        },
      ]}
      dataColumns={[
        {
          key: "granteeMembership",
          label: "授权员工",
          render: (row) => {
            const membership = row.granteeMembership as { user?: { username?: string } } | undefined;
            return membership?.user?.username || "-";
          },
        },
        {
          key: "action",
          label: "授权动作",
          render: (row) => actionLabel((row.action as { key?: string } | undefined)?.key ?? ""),
        },
        { key: "scope", label: "数据范围", render: (row) => scopeLabel(String(row.scope ?? "")) },
        { key: "businessUnitId", label: "业务板块", render: (row) => (row.granteeMembership as { businessUnit?: { name?: string } } | undefined)?.businessUnit?.name ?? "-" },
        { key: "reason", label: "授权原因" },
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
