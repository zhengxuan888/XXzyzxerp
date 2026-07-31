import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getSystemConfigurationPermission } from "@/lib/system-configuration";

const scopes = [
  { value: "SELF", label: "本人" },
  { value: "SUBORDINATES", label: "下属" },
  { value: "SITE", label: "站点" },
  { value: "DEPARTMENT", label: "部门" },
  { value: "DEPARTMENT_TREE", label: "部门及下级" },
  { value: "BUSINESS_UNIT", label: "业务板块" },
  { value: "ALL", label: "全平台" },
];

export default async function DelegationRulesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [permission, systemConfiguration] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "delegation.manage",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
    }),
    getSystemConfigurationPermission({ userId: session.userId, membership }),
  ]);
  if (!permission.allowed || !systemConfiguration.allowed) redirect("/admin");
  const [rows, roles, actions] = await Promise.all([
    prisma.delegationRule.findMany({
      include: { role: true, action: true },
      orderBy: [{ role: { name: "asc" } }, { actionKey: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.action.findMany({ orderBy: [{ namespace: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <CrudPage
      resource="delegation-rules"
      listTitle="权限转授规则"
      canCreate
      canUpdate
      canDelete
      deleteConfirmation="确定关闭这条转授权规则吗？已有额外授权不受影响，但以后不能再授予或续期。"
      rows={rows}
      createFields={[
        { key: "roleId", label: "授权来源角色", type: "select", required: true, options: roles.map((role) => ({ value: role.id, label: role.name })) },
        { key: "actionKey", label: "允许转授的动作", type: "select", required: true, options: actions.map((action) => ({ value: action.key, label: `${action.key} · ${action.name}` })) },
        { key: "maxScope", label: "最大授权范围", type: "select", required: true, options: scopes },
        { key: "canTransfer", label: "允许转授", type: "checkbox" },
      ]}
      dataColumns={[
        { key: "role", label: "来源角色", render: (row) => (row.role as { name?: string } | undefined)?.name ?? "-" },
        { key: "actionKey", label: "动作" },
        { key: "maxScope", label: "最大范围" },
        { key: "canTransfer", label: "转授状态", render: (row) => row.canTransfer ? "允许" : "禁止" },
      ]}
    />
  );
}
