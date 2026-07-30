import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import ReportingLineManager from "@/components/admin/ReportingLineManager";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";

export default async function MembershipsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canManageReportingLine, canCreate, canUpdate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId, membershipId: membership.id, actionKey: "membership.read", targetBusinessUnitId: membership.businessUnitId, targetDepartmentId: membership.departmentId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "membership.reporting_line.manage",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "membership.create",
      targetBusinessUnitId: membership.businessUnitId,
      targetDepartmentId: membership.departmentId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "membership.update",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "membership.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const [rows, users, legalEntities, businessUnits, roles, departments, sites] = await Promise.all([
    prisma.membership.findMany({ where: { businessUnitId: membership.businessUnitId, isActive: true }, orderBy: { createdAt: "desc" }, include: { user: true, role: true, businessUnit: true, department: true, site: true, managerMembership: { include: { user: true } } } }),
    prisma.user.findMany({ where: { OR: [{ memberships: { none: {} } }, { memberships: { some: { businessUnitId: membership.businessUnitId } } }] }, orderBy: { username: "asc" } }),
    prisma.legalEntity.findMany({ where: { businessUnits: { some: { id: membership.businessUnitId } } }, orderBy: { name: "asc" } }),
    prisma.businessUnit.findMany({ where: { id: membership.businessUnitId }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { businessUnitId: membership.businessUnitId }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ where: { businessUnitId: membership.businessUnitId }, orderBy: { code: "asc" } }),
  ]);

  const reportingRows = rows.map((row) => ({
    id: row.id,
    employeeName: row.user.fullName,
    username: row.user.username,
    roleName: row.role.name,
    departmentName: row.department?.name ?? "未分配部门",
    managerMembershipId: row.managerMembershipId,
  }));

  return (<>
    <ReportingLineManager rows={reportingRows} canManage={canManageReportingLine.allowed} />
    <CrudPage
      resource="memberships"
      listTitle="Memberships"
      canCreate={canCreate.allowed}
      canUpdate={canUpdate.allowed}
      canDelete={canDelete.allowed}
      deleteConfirmation="确定停用该员工岗位吗？账号及历史业务记录会保留。"
      rows={rows}
      createFields={[
        {
          key: "userId",
          label: "User",
          type: "select",
          required: true,
          options: users.map((user) => ({ value: user.id, label: `${user.username} (${user.fullName})` })),
        },
        {
          key: "legalEntityId",
          label: "Legal Entity",
          type: "select",
          required: true,
          options: legalEntities.map((entity) => ({ value: entity.id, label: entity.name })),
        },
        {
          key: "businessUnitId",
          label: "Business Unit",
          type: "select",
          required: true,
          options: businessUnits.map((unit) => ({ value: unit.id, label: unit.name })),
        },
        {
          key: "roleId",
          label: "Role",
          type: "select",
          required: true,
          options: roles.map((role) => ({ value: role.id, label: role.name })),
        },
        {
          key: "departmentId",
          label: "Department (optional)",
          type: "select",
          options: departments.map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` })),
        },
        {
          key: "siteId",
          label: "Site (optional)",
          type: "select",
          options: sites.map((site) => ({ value: site.id, label: site.name })),
        },
        {
          key: "managerMembershipId",
          label: "直属上级（可选）",
          type: "select",
          options: reportingRows.map((row) => ({ value: row.id, label: `${row.employeeName} · ${row.roleName}` })),
        },
        {
          key: "scope",
          label: "Scope",
          type: "select",
          required: true,
          options: [
            { value: "ALL", label: "ALL" },
            { value: "BUSINESS_UNIT", label: "BUSINESS_UNIT" },
            { value: "DEPARTMENT", label: "DEPARTMENT" },
            { value: "SITE", label: "SITE" },
          ],
        },
        { key: "isPrimary", label: "主岗位", type: "checkbox" },
        { key: "isActive", label: "启用岗位", type: "checkbox" },
      ]}
      dataColumns={[
        {
          key: "user",
          label: "User",
          render: (row) => ((row.user as { username?: string } | undefined)?.username ?? "-"),
        },
        {
          key: "businessUnit",
          label: "Business Unit",
          render: (row) => ((row.businessUnit as { name?: string } | undefined)?.name ?? "-"),
        },
        { key: "role", label: "Role", render: (row) => ((row.role as { name?: string } | undefined)?.name ?? "-") },
        { key: "managerMembership", label: "直属上级", render: (row) => ((row.managerMembership as { user?: { fullName?: string } } | undefined)?.user?.fullName ?? "-") },
        {
          key: "department",
          label: "Department",
          render: (row) => ((row.department as { name?: string } | undefined)?.name ?? "-"),
        },
        { key: "scope", label: "Scope" },
      ]}
    />
  </>);
}
