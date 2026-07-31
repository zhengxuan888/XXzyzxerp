import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const resourceAssetInclude = {
  category: { select: { id: true, code: true, name: true, isSoftware: true } },
  status: { select: { id: true, code: true, name: true, color: true, isTerminal: true } },
  assignedMembership: {
    select: {
      id: true,
      departmentId: true,
      siteId: true,
      user: { select: { id: true, username: true, fullName: true } },
    },
  },
  softwareProfile: true,
} satisfies Prisma.ResourceAssetInclude;

export type ResourceAssetWithRelations = Prisma.ResourceAssetGetPayload<{ include: typeof resourceAssetInclude }>;

export function resourceTargetOf(resource: Pick<ResourceAssetWithRelations, "businessUnitId" | "departmentId" | "siteId" | "assignedMembershipId">) {
  return {
    businessUnitId: resource.businessUnitId,
    departmentId: resource.departmentId,
    siteId: resource.siteId,
    assignedMembershipId: resource.assignedMembershipId,
  };
}

export function generateResourceNo() {
  // A safe internal fallback for lightweight HR/admin creation. Businesses may
  // still supply their own asset number; no organisational code is embedded.
  return `RES-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export async function resolveResourceReferences({
  auth,
  categoryId,
  statusId,
  departmentId,
  siteId,
  assignedMembershipId,
  requireActiveCategoryAndStatus = true,
}: {
  auth: AuthContext;
  categoryId: string;
  statusId: string;
  departmentId: string | null;
  siteId: string | null;
  assignedMembershipId: string | null;
  requireActiveCategoryAndStatus?: boolean;
}) {
  const activeClause = requireActiveCategoryAndStatus ? { isActive: true } : {};
  const [category, status, selectedDepartment, selectedSite, assignee] = await Promise.all([
    prisma.resourceCategory.findFirst({
      where: { id: categoryId, businessUnitId: auth.membership.businessUnitId, ...activeClause },
      select: { id: true, isSoftware: true },
    }),
    prisma.resourceStatus.findFirst({
      where: { id: statusId, businessUnitId: auth.membership.businessUnitId, ...activeClause },
      select: { id: true },
    }),
    departmentId
      ? prisma.department.findFirst({ where: { id: departmentId, businessUnitId: auth.membership.businessUnitId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    siteId
      ? prisma.site.findFirst({ where: { id: siteId, businessUnitId: auth.membership.businessUnitId, isActive: true }, select: { id: true, departmentId: true } })
      : Promise.resolve(null),
    assignedMembershipId
      ? prisma.membership.findFirst({
          where: {
            id: assignedMembershipId,
            businessUnitId: auth.membership.businessUnitId,
            isActive: true,
            OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
          },
          select: { id: true, departmentId: true, siteId: true, userId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!category) throw new Error("资源分类不存在、已停用或不属于当前业务板块。");
  if (!status) throw new Error("资源状态不存在、已停用或不属于当前业务板块。");
  if (departmentId && !selectedDepartment) throw new Error("使用部门不存在、已停用或不属于当前业务板块。");
  if (siteId && !selectedSite) throw new Error("站点不存在、已停用或不属于当前业务板块。");
  if (assignedMembershipId && !assignee) throw new Error("领用员工不存在、已停用或不属于当前业务板块。");

  let resolvedDepartmentId = departmentId;
  let resolvedSiteId = siteId;
  if (!resolvedDepartmentId && selectedSite?.departmentId) resolvedDepartmentId = selectedSite.departmentId;
  if (selectedSite?.departmentId && resolvedDepartmentId && selectedSite.departmentId !== resolvedDepartmentId) {
    throw new Error("站点与使用部门不匹配。");
  }
  if (assignee?.departmentId) {
    if (resolvedDepartmentId && resolvedDepartmentId !== assignee.departmentId) throw new Error("领用员工与使用部门不匹配。");
    resolvedDepartmentId ??= assignee.departmentId;
  }
  if (assignee?.siteId) {
    if (resolvedSiteId && resolvedSiteId !== assignee.siteId) throw new Error("领用员工与站点不匹配。");
    resolvedSiteId ??= assignee.siteId;
  }

  return {
    category,
    status,
    departmentId: resolvedDepartmentId,
    siteId: resolvedSiteId,
    assignee,
  };
}

export function serializeResource(resource: ResourceAssetWithRelations, showAccountIdentifier: boolean) {
  const profile = resource.softwareProfile
    ? {
        ...resource.softwareProfile,
        renewalCostCents: resource.softwareProfile.renewalCostCents?.toString() ?? null,
        accountIdentifier: showAccountIdentifier ? resource.softwareProfile.accountIdentifier : maskAccountIdentifier(resource.softwareProfile.accountIdentifier),
        accountIdentifierMasked: !showAccountIdentifier,
      }
    : null;
  return {
    ...resource,
    valueCents: resource.valueCents?.toString() ?? null,
    softwareProfile: profile,
  };
}

export function maskAccountIdentifier(value: string | null) {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, Math.max(4, value.length - 4)))}${value.slice(-4)}`;
}
